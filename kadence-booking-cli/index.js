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

const DEFAULT_API_BASE_URL = process.env.KADENCE_API_BASE_URL || 'https://api.onkadence.co/v1/public';
const DEFAULT_LOGIN_BASE_URL = process.env.KADENCE_LOGIN_BASE_URL || 'https://login.onkadence.co';

function createAxiosClient() {
	const staticToken = process.env.KADENCE_API_TOKEN;
	const keyId = process.env.KADENCE_API_KEY_IDENTIFIER;
	const keySecret = process.env.KADENCE_API_KEY_SECRET;

	const client = axios.create({
		baseURL: DEFAULT_API_BASE_URL,
		headers: { Accept: 'application/json, application/ld+json' },
		timeout: 30000,
	});

	let cachedToken = null;
	let tokenExpiresAtMs = 0;

	async function getToken() {
		if (staticToken) return staticToken;
		if (!keyId || !keySecret) {
			throw new Error('Missing Kadence credentials. Set KADENCE_API_TOKEN or KADENCE_API_KEY_IDENTIFIER and KADENCE_API_KEY_SECRET');
		}
		const now = Date.now();
		if (cachedToken && now < tokenExpiresAtMs - 30000) {
			return cachedToken;
		}
		const url = `${DEFAULT_LOGIN_BASE_URL}/oauth2/token`;
		const resp = await axios.post(url, {
			grant_type: 'client_credentials',
			client_id: keyId,
			client_secret: keySecret,
			scope: 'public',
		});
		const { access_token, expires_in } = resp.data || {};
		if (!access_token) {
			throw new Error('Failed to obtain access token from Kadence.');
		}
		cachedToken = access_token;
		tokenExpiresAtMs = now + (Number(expires_in || 3600) * 1000);
		return cachedToken;
	}

	client.interceptors.request.use(async (config) => {
		config.headers = config.headers || {};
		config.headers.Authorization = `Bearer ${await getToken()}`;
		return config;
	});

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

async function findSpaceByName(client, floorId, spaceName, spaceType) {
	const spaces = await findSpacesForFloor(client, floorId);
	const nameNorm = normalizeString(spaceName);
	const typeNorm = normalizeString(spaceType || '');
	const candidate = spaces.find((s) => {
		const sName = normalizeString(s.name) === nameNorm || normalizeString(s.displayName) === nameNorm;
		if (!sName) return false;
		if (!typeNorm) return true;
		const sType = normalizeString(s.type || s.spaceType || s.kind || s.category);
		return sType ? sType === typeNorm : true;
	});
	if (!candidate) throw new Error(`Space not found: ${spaceName}${typeNorm ? ` (type ${spaceType})` : ''} (floor ${floorId})`);
	return candidate;
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

function isValidTimeString(value) {
	const str = String(value || '').trim();
	return /^\d{1,2}:\d{2}$/.test(str);
}

function computeUtcRangeForDateAndTimes(buildingTz, dateStr, startTimeStr, endTimeStr) {
	const date = String(dateStr).trim();
	const startStr = isValidTimeString(startTimeStr) ? String(startTimeStr).trim() : '09:00';
	const endStr = isValidTimeString(endTimeStr) ? String(endTimeStr).trim() : '17:00';
	const startLocal = moment.tz(`${date} ${startStr}`, 'YYYY-MM-DD H:mm', buildingTz);
	const endLocal = moment.tz(`${date} ${endStr}`, 'YYYY-MM-DD H:mm', buildingTz);
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
	// Exact header names as requested
	const email = row['Email Address'];
	const buildingName = row['Building Name'];
	const floorName = row['Floor Name'];
	const spaceName = row['Space Name'];
	const spaceType = row['Space Type'];
	const dateInput = row['Date'];
	const startTimeInput = row['Start Time'];
	const endTimeInput = row['End Time'];

	if (!email || !buildingName || !floorName || !spaceName || !spaceType || !dateInput) {
		throw new Error('CSV row missing required columns (Email Address, Building Name, Floor Name, Space Name, Space Type, Date)');
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateInput).trim())) {
		throw new Error(`Invalid date format for row. Expected YYYY-MM-DD, got: ${dateInput}`);
	}

	const user = await findUserByEmail(client, email);
	const building = await findBuildingByName(client, buildingName);
	const floor = await findFloorByName(client, getEntityId(building), floorName);
	const space = await findSpaceByName(client, getEntityId(floor), spaceName, spaceType);

	const buildingTz = await ensureBuildingTimezone(client, building);
	const { startUtc, endUtc, date } = computeUtcRangeForDateAndTimes(
		buildingTz,
		String(dateInput).trim(),
		startTimeInput,
		endTimeInput
	);

	if (options.dryRun) {
		return {
			status: 'dry-run',
			user: user.email || user.primaryEmail || email,
			building: building.name,
			floor: floor.name,
			space: space.name || space.displayName,
			spaceType: spaceType,
			startUtc,
			endUtc,
			buildingTz,
			date,
		};
	}

	const booking = await createBooking(client, {
		userId: getEntityId(user),
		spaceId: getEntityId(space),
		startUtc,
		endUtc,
	});

	return {
		status: 'created',
		id: booking && (booking.id || extractIdFromIri(booking['@id']) || booking.uuid),
		user: user.email || user.primaryEmail || email,
		building: building.name,
		floor: floor.name,
		space: space.name || space.displayName,
		spaceType: spaceType,
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
		.description('Create space bookings in Kadence from a CSV file')
		.requiredOption('-f, --file <path>', 'Path to CSV file with headers: Email Address, Building Name, Floor Name, Space Name, Space Type, Date, Start Time, End Time')
		.option('--dry-run', 'Resolve lookups and times but do not create bookings', false)
		.option('--concurrency <n>', 'Number of rows to process concurrently', (v) => parseInt(v, 10), 1)
		.option('--base-url <url>', 'Override Kadence API base URL', DEFAULT_API_BASE_URL)
		.option('--log <path>', 'Path to failure log file (CSV)', path.join(process.cwd(), 'kadence-booker-failures.log'))
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

	const logPath = path.isAbsolute(opts.log) ? opts.log : path.join(process.cwd(), opts.log);
	let logInitialized = false;
	function appendFailureLog(rowIndex, row, errorMessage) {
		try {
			if (!logInitialized) {
				const header = 'Row,Email Address,Building Name,Floor Name,Space Name,Space Type,Date,Start Time,End Time,Error\n';
				if (!fs.existsSync(logPath)) {
					fs.writeFileSync(logPath, header, 'utf8');
				} else {
					const existing = fs.readFileSync(logPath, 'utf8');
					if (!existing.startsWith('Row,Email Address')) {
						fs.writeFileSync(logPath, header + existing, 'utf8');
					}
				}
				logInitialized = true;
			}
			const safe = (v) => String(v == null ? '' : v).replaceAll('"', '""');
			const line = [
				rowIndex,
				row['Email Address'],
				row['Building Name'],
				row['Floor Name'],
				row['Space Name'],
				row['Space Type'],
				row['Date'],
				row['Start Time'] || '09:00',
				row['End Time'] || '17:00',
				errorMessage,
			]
				.map((v) => `"${safe(v)}"`)
				.join(',') + '\n';
			fs.appendFileSync(logPath, line, 'utf8');
		} catch (e) {
			console.error(`Failed to write failure log: ${e.message}`);
		}
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
				const res = await processRow(client, row, { dryRun: opts.dryRun });
				results.push({ row: rowIdx + 1, ok: true, res });
				const label = res.space || res.desk;
				console.log(`${res.status === 'created' ? 'Created' : 'Dry-run'}: ${res.user} -> ${res.building} / ${res.floor} / ${label} [${res.date} ${res.buildingTz}]`);
			} catch (e) {
				results.push({ row: rowIdx + 1, ok: false, error: e.message });
				console.error(`Row ${rowIdx + 1} failed: ${e.message}`);
				appendFailureLog(rowIdx + 1, row, e.message);
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