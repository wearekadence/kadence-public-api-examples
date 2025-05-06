/**
 * This file contains the core logic for displaying space availability on a floorplan using the Kadence public API. It fetches
 * workspace and booking data to determine which spaces are booked or free, and maps that status onto a visual floorplan.
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

window.addEventListener('load', async function () {

    // Colours constants for the floorplan display
    const COLOR_AVAILABLE = '#60D27B';
    const COLOR_BOOKED = '#FF9B53';
        
    // UI Elements
    const loadingSpinner = document.getElementById('loadingSpinner');
    const mainContentContainer = document.getElementById('mainContentContainer');

    const floorplanLoadingSpinner = document.getElementById('floorplanLoadingSpinner');
    const floorplanContainer = document.getElementById('floorplanContainer');
    const noFloorplanContainer = document.getElementById('noFloorplanContainer');

    /**
     * Start of Kadence API helpers - i.e. functions that are used to retrieve data from the Kadence API
     */

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
        const buildingsMap = {};

        for (const building of data) {
            const buildingId = building.id;
            const floors = await getFloors(buildingId);
            building.floors = floors;
            buildingsMap[buildingId] = building;
        }

        return buildingsMap;
    }

    async function getFloors(buildingId) {
        /**
         * This is where we call the Kadence API to retrieve information about floors. For the full API definition you
         * can refer to the following link:
         *
         * https://api.kadence.co/#tag/Floor/operation/api_v1publicfloors_get_collection
         *
         * In this example, we're not doing any filtering or paging.
         */
        const floorsResponse = await axios.get(`/v1/public/floors?buildingId=${buildingId}`);
        return floorsResponse.data['hydra:member'];
    }

    async function getBookingsForToday(floorId) {
        /**
         * This is where we call the Kadence API to retrieve information about bookings for a floor. For the full API definition you
         * can refer to the following link:
         *
         * https://api.kadence.co/#tag/Booking/operation/api_v1publicbookings_get_collection
         */
        const today = getDateToday();
        const bookingsResponse = await axios.get(`/v1/public/bookings?itemsPerPage=500&floorId=${floorId}&order[startDateTime]=asc&startDateTime[local_after]=${today}T00:00:00Z&startDateTime[local_before]=${today}T23:59:59Z`);
        return bookingsResponse.data['hydra:member'];
    }

    function getDateToday() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Start of UI utility functions - i.e. functions used the core UI of the application.
     */

    function showHideLoadingMainSpinner(show) {
        if (show) {
            loadingSpinner.style.display = 'block';
            mainContentContainer.style.display = 'none';
        } else {
            loadingSpinner.style.display = 'none';
            mainContentContainer.style.display = 'block';
        }
    }

    function showHideFloorplanLoadingSpinner(show) {
        if (show) {
            floorplanLoadingSpinner.style.display = 'block';
            floorplanContainer.style.display = 'none';
            noFloorplanContainer.style.display = 'none';
        } else {
            floorplanLoadingSpinner.style.display = 'none';
        }
    }

    function showHideFloorplan(show) {
        if (show) {
            floorplanContainer.style.display = 'block';
            noFloorplanContainer.style.display = 'none';
        } else {
            floorplanContainer.style.display = 'none';
            noFloorplanContainer.style.display = 'block';
        }

        showHideFloorplanLoadingSpinner(false);
    }

    function handleBuildingChange() {
        const buildingSelector = document.getElementById('building');
        const buildingId = buildingSelector.value;
        const floors = buildings[buildingId].floors;
        const floorSelector = document.getElementById('floor');
        floorSelector.innerHTML = '';

        for (const floor of floors) {
            const option = document.createElement('option');
            option.value = floor.id;
            option.textContent = floor.name;
            floorSelector.appendChild(option);
        }

        handleFloorChange();
    }

    function handleFloorChange() {
        const floorSelector = document.getElementById('floor');
        const floorId = floorSelector.value;

        const buildingId = document.getElementById('building').value;
        const floors = buildings[buildingId].floors;

        let floor = null;

        Object.values(floors).some((flr) => {
            if (flr.id === floorId) {
                floor = flr;
                return true;
            }
            return false;
        });

        if (!floor) {
            throw new Error('Floor not found');
        }

        populateFloorplan(floor);
    }

    async function populateFloorplan(floor) {
        console.log('Populating floorplan: ', floor.name);

        // If there is no floorplan URL, hide the floorplan and show an error message
        if (!floor || !floor.floorplanUrl) {
            showHideFloorplan(false);
            return;
        }

        // Show the loading spinner for the floorplan
        showHideFloorplanLoadingSpinner(true);

        // Hit the Kadence API, get the floorplan & booking information
        await Promise.all([
            populateFloorplanSvg(floor.floorplanUrl),
            getBookingsForToday(floor.id)
        ])
        .then(([svgElement, bookings]) => {
            // Create a map of space ID to bookings, this will be used to determine the booking status of each space
            let bookingSpaceMap = {};
            bookings.forEach((booking) => {
                const spaceId = booking.space.id;
                if (!bookingSpaceMap[spaceId]) {
                    bookingSpaceMap[spaceId] = []
                }
                bookingSpaceMap[spaceId].push(booking);
            });
            
            // Get all the spaces in the floorplan and set their fill colour based on the booking status
            const svgSpaces = svgElement.querySelectorAll('g[id^="space::"]');
            for (const svgSpace of svgSpaces) {

                // In the SVG the space ID is part of the ID attribute, this is the format:
                // space::<space_type>::<spaceId>
                const spaceId = svgSpace.id.split('::')[2];

                // If the space is in the bookingSpaceMap then it is booked, otherwise it is available
                if (bookingSpaceMap[spaceId]) {
                    svgSpace.style.fill = COLOR_BOOKED;
                } else {
                    svgSpace.style.fill = COLOR_AVAILABLE;
                }
            }

            showHideFloorplan(true);
        })
    }

    async function populateFloorplanSvg(floorplanUrl) {
        // Get the floorplan SVG and insert it into the floorplan container
        const svg = (await axios.get(floorplanUrl)).data;
        const floorplanContainer = document.getElementById('floorplanContainer');

        floorplanContainer.innerHTML = svg;

        const svgElement = floorplanContainer.querySelector('svg');
        if (svgElement) {
            // Set the SVG to preserve the aspect ratio and set the width to 100%
            svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgElement.style.width = '100%';
            svgElement.style.height = 'auto';
            svgElement.style.maxHeight = '600px';
        } else {
            throw new Error('No SVG element found');
        }

        return svgElement;
    }

    //Show the loading spinner
    showHideLoadingMainSpinner(true);
    
    //Retrieve information about buildings and their floors
    const buildings = await getBuildings();

    // If no buildings are found, throw an error
    if (buildings.length === 0) {
        throw new Error('No buildings found');
    }

    //Get floor selector and register a selection change handler
    const floorSelector = document.getElementById('floor');
    floorSelector.addEventListener('change', handleFloorChange);

    //Get building selector and register a selection change handler
    const buildingSelector = document.getElementById('building');
    for (const buildingId in buildings) {
        const building = buildings[buildingId];
        const option = document.createElement('option');
        option.value = buildingId;
        option.textContent = building.name;
        buildingSelector.appendChild(option);
    }
    handleBuildingChange(buildingSelector.value);

    //Set up a listener for when the building selector changes
    buildingSelector.addEventListener('change', handleBuildingChange);
    
    //Hide the loading spinner
    showHideLoadingMainSpinner(false);
});