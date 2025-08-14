#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { parse } = require('csv-parse');
const axios = require('axios');
const moment = require('moment-timezone');
const { Command } = require('commander');
require('dotenv').config();

const streamPipeline = promisify(pipeline);

const DEFAULT_API_BASE_URL = process.env.KADENCE_API_BASE_URL || 'https://api.kadence.co/v1/public';

function createAxiosClient() {
	const token = process.env.KADENCE_API_TOKEN;
	const keyId = process.env.KADENCE_API_KEY_IDENTIFIER;
	const keySecret = process.env.KADENCE_API_KEY_SECRET;

	const headers = {
		Accept: 'application/json, application/ld+json',
	};

	const config = {
		baseURL: DEFAULT_API_BASE_URL,
		headers,
		timeout: 30000,
	};

	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	} else if (keyId && keySecret) {
		config.auth = { username: keyId, password: keySecret };
	}

	const client = axios.create(config);

	client.interceptors.response.use(
		(resp) => resp,
		(err) => {
			if (err.response) {
				const { status, data } = err.response;
				const detail = data && (data.detail || data.message || JSON.stringify(data));
				err.message = `HTTP ${status}: ${detail}`;
			}
			return Promise.reject(err);
		}
	);

	return client;
}

function toHydraMembers(data) {
	if (!data) return [];
	if (Array.isArray(data)) return data;
	if (data['hydra:member']) return data['hydra:member'];
	if (data.items) return data.items;
	return [];
}

function normalizeString(value) {
	return String(value || '').trim().toLowerCase();
}

function extractIdFromIri(iriOrId) {
	if (iriOrId == null) return undefined;
	const str = String(iriOrId);
	if (!str) return undefined;
	// If looks like '/resource/123' or 'https://.../resource/123', return last segment
	const noQuery = str.split('?')[0];
	const parts = noQuery.split('/').filter(Boolean);
	return parts.length ? parts[parts.length - 1] : str;
}

function getEntityId(entity) {
	if (!entity) return undefined;
	return (
		entity.id ||
		extractIdFromIri(entity['@id']) ||
		entity.identifier ||
		entity.uuid
	);
}

async function readCsv(filePath) {
	return new Promise((resolve, reject) => {
		const rows = [];
		fs.createReadStream(filePath)
			.pipe(
				parse({
					columns: true,
					trim: true,
					skip_empty_lines: true,
				})
			)
			.on('data', (row) => rows.push(row))
			.on('end', () => resolve(rows))
			.on('error', reject);
	});
}

async function findBuildingByName(client, buildingName) {
	const nameNorm = normalizeString(buildingName);
	const resp = await client.get('/buildings');
	const buildings = toHydraMembers(resp.data);
	const found = buildings.find((b) => normalizeString(b.name) === nameNorm);
	if (!found) throw new Error(`Building not found: ${buildingName}`);
	return found;
}

async function findFloorsForBuilding(client, buildingId) {
	// Try common patterns
	try {
		const resp = await client.get('/floors', { params: { 'building.id': buildingId } });
		return toHydraMembers(resp.data);
	} catch (_) {}
	try {
		const resp = await client.get(`/buildings/${encodeURIComponent(buildingId)}/floors`);
		return toHydraMembers(resp.data);
	} catch (e) {
		throw new Error(`Unable to list floors for building ${buildingId}: ${e.message}`);
	}
}

async function findFloorByName(client, buildingId, floorName) {
	const floors = await findFloorsForBuilding(client, buildingId);
	const nameNorm = normalizeString(floorName);
	const found = floors.find((f) => normalizeString(f.name) === nameNorm);
	if (!found) throw new Error(`Floor not found: ${floorName} (building ${buildingId})`);
	return found;
}

async function findSpacesForFloor(client, floorId) {
	try {
		const resp = await client.get('/spaces', { params: { 'floor.id': floorId } });
		return toHydraMembers(resp.data);
	} catch (_) {}
	try {
		const resp = await client.get(`/floors/${encodeURIComponent(floorId)}/spaces`);
		return toHydraMembers(resp.data);
	} catch (e) {
		throw new Error(`Unable to list spaces for floor ${floorId}: ${e.message}`);
	}
}

async function findDeskByName(client, floorId, deskName) {
	const spaces = await findSpacesForFloor(client, floorId);
	const nameNorm = normalizeString(deskName);
	const found = spaces.find((s) => normalizeString(s.name) === nameNorm || normalizeString(s.displayName) === nameNorm);
	if (!found) throw new Error(`Desk/space not found: ${deskName} (floor ${floorId})`);
	return found;
}

async function findUserByEmail(client, email) {
	let members = [];
	try {
		const resp = await client.get('/users', { params: { email } });
		members = toHydraMembers(resp.data);
	} catch (_) {
		const resp = await client.get('/users');
		members = toHydraMembers(resp.data);
	}
	const emailNorm = normalizeString(email);
	const found = members.find((u) => normalizeString(u.email) === emailNorm || normalizeString(u.primaryEmail) === emailNorm);
	if (!found) throw new Error(`User not found by email: ${email}`);
	return found;
}

function resolveBuildingTimezone(building) {
	return (
		building.timezone ||
		building.timeZone ||
		building.tz ||
		building.time_zone ||
		'UTC'
	);
}

async function ensureBuildingTimezone(client, building) {
	let tz = resolveBuildingTimezone(building);
	if (tz && tz !== 'UTC') return tz;
	try {
		const id = getEntityId(building);
		if (!id) return tz;
		const resp = await client.get(`/buildings/${id}`);
		const full = resp.data || {};
		return (
			full.timezone || full.timeZone || full.tz || full.time_zone || tz
		);
	} catch (_) {
		return tz;
	}
}

function computeUtcRangeForDate(buildingTz, dateStr) {
	// dateStr expected YYYY-MM-DD; if absent, use today in building tz
	const date = dateStr || moment().tz(buildingTz).format('YYYY-MM-DD');
	const startLocal = moment.tz(`${date} 09:00`, 'YYYY-MM-DD HH:mm', buildingTz);
	const endLocal = moment.tz(`${date} 17:00`, 'YYYY-MM-DD HH:mm', buildingTz);
	return { startUtc: startLocal.utc().toISOString(), endUtc: endLocal.utc().toISOString(), date };
}

async function createBooking(client, payload) {
	// Prefer minimal fields to reduce mismatch risk
	const bodyCandidates = [
		{
			userId: payload.userId,
			spaceId: payload.spaceId,
			startDateTime: payload.startUtc,
			endDateTime: payload.endUtc,
		},
		{
			user: payload.userIri || (payload.userId ? `/users/${payload.userId}` : undefined),
			space: payload.spaceIri || (payload.spaceId ? `/spaces/${payload.spaceId}` : undefined),
			startDateTime: payload.startUtc,
			endDateTime: payload.endUtc,
		},
	];

	let lastError = null;
	for (const body of bodyCandidates) {
		try {
			const resp = await client.post('/bookings', body);
			return resp.data;
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError || new Error('Failed to create booking with any payload variant');
}

async function processRow(client, row, options) {
	const email = row['email address'] || row.email || row['Email'] || row['Email Address'];
	const buildingName = row['building name'] || row.building || row['Building'] || row['Building Name'];
	const floorName = row['floor name'] || row.floor || row['Floor'] || row['Floor Name'];
	const deskName = row['desk name'] || row.desk || row['Desk'] || row['Desk Name'];

	if (!email || !buildingName || !floorName || !deskName) {
		throw new Error('CSV row missing required columns (email address, building name, floor name, desk name)');
	}

	const user = await findUserByEmail(client, email);
	const building = await findBuildingByName(client, buildingName);
	const floor = await findFloorByName(client, getEntityId(building), floorName);
	const desk = await findDeskByName(client, getEntityId(floor), deskName);

	const buildingTz = await ensureBuildingTimezone(client, building);
	const { startUtc, endUtc, date } = computeUtcRangeForDate(buildingTz, options.date);

	if (options.dryRun) {
		return {
			status: 'dry-run',
			user: user.email || user.primaryEmail || email,
			building: building.name,
			floor: floor.name,
			desk: desk.name || desk.displayName,
			startUtc,
			endUtc,
			buildingTz,
			date,
		};
	}

	const booking = await createBooking(client, {
		userId: getEntityId(user),
		spaceId: getEntityId(desk),
		startUtc,
		endUtc,
	});

	return {
		status: 'created',
		id: booking && (booking.id || extractIdFromIri(booking['@id']) || booking.uuid),
		user: user.email || user.primaryEmail || email,
		building: building.name,
		floor: floor.name,
		desk: desk.name || desk.displayName,
		startUtc,
		endUtc,
		buildingTz,
		date,
	};
}

async function run() {
	const program = new Command();
	program
		.name('kadence-booker')
		.description('Create desk bookings in Kadence from a CSV file')
		.requiredOption('-f, --file <path>', 'Path to CSV file with columns: email address, building name, floor name, desk name')
		.option('-d, --date <YYYY-MM-DD>', 'Booking date in building timezone (default: today in building timezone)')
		.option('--dry-run', 'Resolve lookups and times but do not create bookings', false)
		.option('--concurrency <n>', 'Number of rows to process concurrently', (v) => parseInt(v, 10), 1)
		.option('--base-url <url>', 'Override Kadence API base URL', DEFAULT_API_BASE_URL)
		.parse(process.argv);

	const opts = program.opts();

	const filePath = path.isAbsolute(opts.file) ? opts.file : path.join(process.cwd(), opts.file);
	if (!fs.existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}

	const client = createAxiosClient();
	if (opts.baseUrl && opts.baseUrl !== DEFAULT_API_BASE_URL) {
		client.defaults.baseURL = opts.baseUrl;
	}

	const rows = await readCsv(filePath);
	if (!rows.length) {
		console.log('No rows found in CSV. Nothing to do.');
		return;
	}

	console.log(`Processing ${rows.length} row(s)...`);

	const concurrency = Math.max(1, Number(opts.concurrency || 1));
	const results = [];
	let index = 0;

	async function worker() {
		while (true) {
			let rowIdx;
			let row;
			if (index < rows.length) {
				rowIdx = index++;
				row = rows[rowIdx];
			} else {
				break;
			}
			try {
				const res = await processRow(client, row, { date: opts.date, dryRun: opts.dryRun });
				results.push({ row: rowIdx + 1, ok: true, res });
				console.log(`${res.status === 'created' ? 'Created' : 'Dry-run'}: ${res.user} -> ${res.building} / ${res.floor} / ${res.desk} [${res.date} ${res.buildingTz}]`);
			} catch (e) {
				results.push({ row: rowIdx + 1, ok: false, error: e.message });
				console.error(`Row ${rowIdx + 1} failed: ${e.message}`);
			}
		}
	}

	const workers = Array.from({ length: concurrency }, () => worker());
	await Promise.all(workers);

	const successCount = results.filter((r) => r.ok).length;
	const failureCount = results.length - successCount;
	console.log(`Done. Success: ${successCount}, Failed: ${failureCount}`);

	if (failureCount > 0) process.exitCode = 1;
}

run().catch((e) => {
	console.error(e.message || e);
	process.exit(1);
});