/**
 * This file contains all the logic we are using to populate booking information for the dashboard.
 *
 * We recommend that you hide all Kadence API calls in your chosen backend service. In this code sample
 * we are deliberately exposing the direct Kadence API & responses to demonstrate how you can use the API without
 * the addition of another abstraction layer making it harder.
 *
 * To get started building applications with this API we recommend the following resources:
 *
 *  1. Getting Started Guide (https://help.kadence.co/kb/guide/en/api-getting-started-developer-guide-yUYh7DBxBW/Steps/2372425)
 *  2. API specification (https://api.kadence.co/)
 */

(async function() {

    // These variables are used to cache responses from the Kadence API.
    const bookings = [];
    const buildings = {};
    const users = {};

    /**
     * Start of Kadence API helpers - i.e. functions that are used to retrieve data from the Kadence API
     */

    async function getBookings() {
        function getDateToday() {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
            const day = String(today.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        /**
         * This is where we call the Kadence API to retrieve information about bookings. For the full API definition you
         * can refer to the following link:
         *
         * https://api.kadence.co/#tag/Booking/operation/api_v1publicbookings_get_collection
         *
         * To demonstrate filtering and sorting, this is what we're asking for in this API call:
         *
         *  1. Limit response to 20 bookings.
         *  2. Order bookings by start date.
         *  3. Only display bookings after today.
         *
         * You can change the data that's retrieved here to anything you'd like and in any combination. The API also
         * supports paging, should you need to retrieve multiple batches of data.
         */
        const bookingsResponse = await axios.get('/v1/public/bookings?itemsPerPage=200&order[startDateTime]=asc&type=desk&startDateTime[after]=' + getDateToday() + 'T00:00:00Z');
        bookings.push(...bookingsResponse.data['hydra:member']);
        return bookings;
    }

    async function getBuildings() {
        /**
         * This is where we call the Kadence API to retrieve information about buildings. For the full API definition you
         * can refer to the following link:
         *
         * https://api.kadence.co/#tag/Building/operation/api_v1publicbuildings_get_collection
         *
         * In this example, we're not doing any filtering or paging.
         */
        const buildingsResponse = await axios.get('/v1/public/buildings');
        const data = buildingsResponse.data['hydra:member'];

        data.forEach((building) => {
            buildings[building['@id']] = building;
        });

        return buildings;
    }

    async function getUsers() {
        /**
         * This is where we call the Kadence API to retrieve information about users. For the full API definition you
         * can refer to the following link:
         *
         * https://api.kadence.co/#tag/User/operation/api_v1publicusers_get_collection
         *
         * In this example, we're applying limits beyond the standard page size.
         */
        const usersResponse = await axios.get('/v1/public/users?itemsPerPage=100');
        const data = usersResponse.data['hydra:member'];

        data.forEach((user) => {
            users[user['@id']] = user;
        });

        return users;
    }

    async function getBuilding(buildingUri) {
        if (!buildings[buildingUri]) {
            const buildingResponse = await axios.get(buildingUri);
            buildings[buildingUri] = buildingResponse.data;
        }
        return buildings[buildingUri];
    }

    async function getUser(userUri) {
        if (!users[userUri]) {
            const userResponse = await axios.get(userUri);
            users[userUri] = userResponse.data;
        }
        return users[userUri];
    }

    async function getUserName(userUri) {
        try {
            const user = await getUser(userUri);
            return user.firstName + ' ' + user.lastName;
        } catch (e) {
            return 'Unknown';
        }
    }

    async function getBuildingName(buildingUri) {
        try {
            const building = await getBuilding(buildingUri);
            return building.name;
        } catch (e) {
            return 'Unknown';
        }
    }

    /**
     * Start of UI population functions - i.e. functions used to manipulate the data retrieved and visualise it.
     */

    async function populateBookingSourceChart() {
        let rawBookingSource = {
            android: 0,
            assigned_desk: 0,
            calendar: 0,
            ios: 0,
            publicApi: 0,
            web: 0,
        };

        bookings.forEach((booking) => {
            let source = booking.source;

            if (booking.permanent) {
                source = 'assigned_desk'
            }

            if (!rawBookingSource[source]) {
                rawBookingSource[source] = 0;
            }

            rawBookingSource[source]++;
        });

        await createPieChart({
            rawData: rawBookingSource,
            chartContainer: 'bookingSource',
            seriesLabel: 'Booking Source'
        });
    }

    async function populateUsersChart() {
        let userCounts = {};

        bookings.forEach((booking) => {
            if (!userCounts[booking.userId]) {
                userCounts[booking.userId] = 0;
            }
            userCounts[booking.userId]++;
        });

        await createPieChart({
            rawData: userCounts,
            labelFunction: getUserName,
            chartContainer: 'bookingUsers',
            seriesLabel: 'User'
        });
    }

    async function populateBuildingChart() {
        let buildingCounts = {};

        bookings.forEach((booking) => {
            if (!buildingCounts[booking.building]) {
                buildingCounts[booking.building] = 0;
            }
            buildingCounts[booking.building]++;
        });

        await createPieChart({
            rawData: buildingCounts,
            labelFunction: getBuildingName,
            chartContainer: 'bookingBuildings',
            seriesLabel: 'Buildings'
        });
    }

    async function populateDeskBookingsTable() {
        const data = [];

        if (!bookings.length) {
            document.getElementById('bookingsTable').innerHTML = 'No bookings to display.';
            return;
        }

        for (let i = 0; i < bookings.length; i++) {
            const booking = bookings[i];
            const date = new Date(booking.startDate);

            data.push({
                name: await getUserName(booking.userId),
                building: await getBuildingName(booking.building),
                floor: booking.space.floor.name,
                space: booking.space.name,
                date: date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'),
                time: date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0')
            });
        }

        new Tabulator("#bookingsTable", {
            data: data,
            layout: 'fitColumns',
            columns:[
                { title: 'Name', field: 'name' },
                { title: 'Building', field: 'building' },
                { title: 'Floor', field: 'floor' },
                { title: 'Space', field: 'space' },
                { title: 'Date', field: 'date' },
                { title: 'Time', field: 'time' }
            ]
        });
    }

    /**
     * Start of UI utility functions - i.e. functions used by the population functions to maximise code reuse.
     */

    async function getPercentages(rawNumbers, labelFn) {
        const keys = Object.keys(rawNumbers);
        let total = 0;
        let data = [];

        //Work out the total of all raw numbers before calculating.
        keys.forEach((key) => {
            total += rawNumbers[key];
        });

        //Convert raw numbers to percentage values of the total structure.
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            data.push({
                name: (labelFn) ? await labelFn(key) : key,
                y: (rawNumbers[key] / total) * 100
            });
        }

        return data;
    }

    async function createPieChart(config) {
        const data = await getPercentages(config.rawData, config.labelFunction);

        Highcharts.chart(config.chartContainer, {
            chart: {
                type: 'pie',
                height: 250
            },
            title: {
                text: ''
            },
            tooltip: {
                pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
            },
            plotOptions: {
                pie: {
                    size: 140
                }
            },
            credits: {
                enabled: false
            },
            series: [{
                name: config.seriesLabel,
                colorByPoint: true,
                data: data
            }]
        });
    }

    /**
     * This is the starting point. We do a batch of two things here:
     *
     *  1. We retrieve information back from the Kadence API.
     *  2. We populate the widgets and tables with the data we've retrieved.
     */

    // Hit the Kadence API and get booking, building and user information
    await Promise.all([
        getBookings(),
        getBuildings(),
        getUsers()
    ]);

    // Using the data we've retrieved render widgets
    await Promise.all([
        populateBookingSourceChart(),
        populateUsersChart(),
        populateBuildingChart(),
        populateDeskBookingsTable()
    ]);
})();