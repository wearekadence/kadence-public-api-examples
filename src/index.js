const express = require('express');
const path = require('path');
const bodyParser  = require('body-parser');

const app = express();
const START_PORT = 3000;

const KADENCE_API_IDENTIFIER = process.env.KADENCE_API_KEY_IDENTIFIER;
const KADENCE_API_SECRET = process.env.KADENCE_API_KEY_SECRET;
const Kadence = require('./lib/Kadence');
const kadence = new Kadence(KADENCE_API_IDENTIFIER, KADENCE_API_SECRET);

/**
 * Check to ensure that the API key and secret are set in the environment variables. If they are not set, we're
 * throwing an error and stopping the server from starting. Check out the README.md file for more information on
 * setting up your environment variables.
 */

if (!KADENCE_API_IDENTIFIER || !KADENCE_API_SECRET) {
    throw new Error('KADENCE_API_KEY_IDENTIFIER or KADENCE_API_KEY_SECRET is not set. Please set up it up in your environment variables. See https://help.kadence.co/kb/guide/en/how-to-create-an-api-key-Wzt5dE1Kbe/Steps/2372427 for creating an API key.');
}

/**
 * Routes - Static Routes for Examples
 *
 * These routes serve the static files for the examples. This is not required for the public API to work, but it is
 * required for the examples to work.
 */

app.use('/', express.static(path.join(__dirname, 'home')));
app.use('/list-bookings', express.static(path.join(__dirname, 'examples/list-bookings')));

/**
 * Routes - Public API Routes
 *
 * These routes directly mirror the routes available in the public API. We're doing this to make it easier to see
 * how the public API works in the web page examples. In your own application, we recommend abstracting calls to the
 * Kadence API in a backend service that limits access to the API key and secret & full access to the API.
 */
app.get('/v1/public/bookings', bodyParser.json(), async (req, res) => {
    const bookings = await kadence.getBookings(req.query);
    res.status(bookings.status);
    res.send(JSON.stringify(bookings.data));
});

app.get('/v1/public/users', async (req, res) => {
    const users = await kadence.getUsers(req.query);
    res.status(users.status);
    res.send(JSON.stringify(users.data));
});

app.get('/v1/public/users/:userId', async (req, res) => {
    const userId = req.params.userId;
    const user = await kadence.getUser(userId, req.query);
    res.status(user.status);
    res.send(JSON.stringify(user.data));
});

app.get('/v1/public/buildings/', async (req, res) => {
    const buildings = await kadence.getBuildings(req.query);
    res.status(buildings.status);
    res.send(JSON.stringify(buildings.data));
});

app.get('/v1/public/buildings/:buildingId', async (req, res) => {
    const buildingId = req.params.buildingId;
    const building = await kadence.getBuilding(buildingId, req.query);
    res.status(building.status);
    res.send(JSON.stringify(building.data));
});

/**
 * This is where we are starting the server. We're starting it on port 3000 and if that port is already in use, we're
 * incrementing the port number and trying again. This gets the server running on the first available port with out you
 * having to modify the port number manually.
 */

function startServer(port) {
    app.listen(port, async () => {
        console.log(`Kadence - Public API Examples - Running on port ${port}\nhttp://localhost:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            startServer(port + 1);
        } else {
            throw new Error(err || 'Unknown error: Unable to start server');
        }
    });
}

startServer(START_PORT);