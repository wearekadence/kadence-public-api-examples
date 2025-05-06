/**
 * This class acts as a wrapper for the Kadence API. It handles the authentication and provides methods to call the API.
 *
 * The logic in this file can be used as a starting point for your own implementation. Kadence does not provide
 * an SDK for any language at the moment.
 *
 * To get started building applications with this API we recommend the following resources:
 *
 *  1. Getting Started Guide (https://help.kadence.co/kb/guide/en/api-getting-started-developer-guide-yUYh7DBxBW/Steps/2372425)
 *  2. API specification (https://api.kadence.co/)
 */

const axios = require('axios');

class Kadence {

    #apiIdentifier;
    #apiSecret;
    #token;

    constructor(identifier, secret) {
        this.#apiIdentifier = identifier;
        this.#apiSecret = secret;
    };

    async #getToken() {
        if (!this.#token) {
            const authResponse = await axios.post('https://login.onkadence.co/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: this.#apiIdentifier,
                client_secret: this.#apiSecret,
                scope: 'public'
            });

            this.#token = authResponse.data;

            //Set timeout to expire token after expires_in seconds
            setTimeout(() => {
                this.#token = null;
            }, this.#token.expires_in * 1000);
        }
        return this.#token.access_token;
    }

    // This is a simple utility function to convert an object to a query string and is used in the mapping from
    // routes in express to function calls in this class.
    #toQueryString(params) {
        return Object.keys(params)
            .map((key) => {
                const param = params[key];

                //if param is object then stringify it e.g. order: { id: 'asc' } => order[id]=asc
                if (typeof param === 'object') {
                    return Object.keys(param)
                        .map((subKey) => {
                            return key + '[' + subKey + ']=' + param[subKey];
                        })
                        .join('&');
                }

                return key + '=' + params[key]
            })
            .join('&');
    }

    async getBooking(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/bookings/${id}?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getBookings(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = 'https://api.onkadence.co/v1/public/bookings?' + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async checkIn(id, params, data) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/bookings/${id}/check-in?` + this.#toQueryString(params);

        console.log(url, data);

        return await axios.post(url, data || {}, {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/ld+json'
            },
            validateStatus: () => true
        });
    }

    async getUser(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/users/${id}?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getUsers(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/users?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getUserBookings(userId, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/users/${userId}/bookings?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getBuilding(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/buildings/${id}?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getBuildings(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/buildings?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getFloors(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/floors?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getFloor(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/floors/${id}?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getNeighborhoods(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/neighborhoods?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getNeighborhood(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/neighborhoods/${id}?` + this.#toQueryString(params);
        
        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getSpaces(params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/spaces?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }

    async getSpace(id, params) {
        params = params || {};

        const bearerToken = await this.#getToken();
        const url = `https://api.onkadence.co/v1/public/spaces/${id}?` + this.#toQueryString(params);

        console.log(url);

        return await axios.get(url, {
            headers: {
                Authorization: `Bearer ${bearerToken}`
            },
            validateStatus: () => true
        });
    }
}
module.exports = Kadence;