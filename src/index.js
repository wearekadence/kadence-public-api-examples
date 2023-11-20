const express = require('express');
const path = require('path');
const app = express();
const START_PORT = 3000;
const KADENCE_API_IDENTIFIER = process.env.KADENCE_API_KEY_IDENTIFIER;
const KADENCE_API_SECRET = process.env.KADENCE_API_KEY_SECRET;

if (!KADENCE_API_IDENTIFIER) {
    throw new Error('KADENCE_API_KEY_IDENTIFIER is not set. Please set up it up in your environment variables. See https://help.kadence.co/kb/guide/en/how-to-create-an-api-key-Wzt5dE1Kbe/Steps/2372427 for creating an API key.');
}

if (!KADENCE_API_SECRET) {
    throw new Error('KADENCE_API_KEY_SECRET is not set. Please set up it up in your environment variables. See https://help.kadence.co/kb/guide/en/how-to-create-an-api-key-Wzt5dE1Kbe/Steps/2372427 for creating an API key.');
}

// app.get('/', (req, res) => {
//     res.send('Hello World!')
// });

app.use('/', express.static(path.join(__dirname, 'home')));


function startServer(port) {
    app.listen(port, () => {
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