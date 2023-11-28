/**
 * This file contains all the logic we are using to check a user into a booking. In this example we are treating
 * room bookings differently to other bookings by not automatically checking them in. This is because we want to
 * allow users to check themselves in to a room booking when they arrive at the room.
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

window.addEventListener('load', function () {

    /**
     * Start of Kadence API helpers - i.e. functions that are used to retrieve data from the Kadence API
     */

    async function getUserByEmailAddress(emailAddress) {

        /**
         * Here we're going to the Kadence API and attempting to find a user with the email address that's been supplied.
         * For more information on other prorerties you can search by please see:
         *
         * https://api.kadence.co/#tag/User/operation/api_v1publicusers_get_collection
         */

        const userResponse = await axios.get('/v1/public/users?email=' + emailAddress);
        const data = userResponse.data;

        if (data['hydra:member'].length) {
            return data['hydra:member'][0];
        }

        return null;
    }

    async function getBookingByUserForToday(userId) {

        function getDate(tomorrow) {
            const date = new Date();

            if (tomorrow) {
                date.setDate(date.getDate() + 1);
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const today = getDate();
        const tomorrow = getDate(true);

        /**
         * Here we're going to the Kadence API and attempting to find all bookings for a specific user for today.
         * For more information on other properties you can search by please see:
         *
         * https://api.kadence.co/#tag/Booking/operation/api_v1publicusers_idbookings_get_collection
         *
         * In this example we're limiting results that span 'today' and order them by startDateTime ascending.
         * We're using 'local_after' and 'local_before' to ensure we're getting bookings back within the timezone that
         * for the building the booking was made in.
         */
        const bookingResponse = await axios.get(`/v1/public/users/${userId}/bookings?order[startDateTime]=asc&startDateTime[local_after]=${today}T00:00:00Z&endDateTime[local_before]=${tomorrow}T00:00:00Z`);
        const data = bookingResponse.data;

        if (data['hydra:member'].length) {
            return data['hydra:member'];
        }

        return null;
    }

    async function bookingCheckin(bookingId, userId, source) {

        /**
         * Here we're going to the Kadence API and attempting to check a user into a booking. For more information on
         * post data please see:
         *
         * https://api.kadence.co/#tag/Booking/operation/api_v1publicbookings_idcheck-in_post
         */

        const checkinResponse = await axios.post(
            `/v1/public/bookings/${bookingId}/check-in`,
            {
                userId: userId,
                method: 'doorAccess'
            }
        );
        return checkinResponse.data;
    }


    /**
     * Start of UI utility functions - i.e. functions used the core UI of the application.
     */

    function showSuccessMessage(message) {
        Swal.fire({
            icon: 'success',
            title: 'Success',
            text: message
        });
    }

    function showErrorMessage(message) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: message
        });
    }

    /**
     * Start application code - this will register a submit listener for the check in form and trigger a check in.
     */

    document.querySelector('#checkinForm')
        .addEventListener('submit', async function(e) {
            e.preventDefault();

            const EMAIL_ADDRESS = document.querySelector('#emailAddress').value;
            const CHECK_IN_SOURCE = document.querySelector('#checkInSource').value;

            // Check if we can find a user with the given email address.
            let user = await getUserByEmailAddress(EMAIL_ADDRESS);

            // No user, exit early and show a warning to the user.
            if (!user) {
                showErrorMessage(`Unable to find user with email address ${EMAIL_ADDRESS}`);
                return;
            }

            // We have a user, now we need to check if they have any booking to see we can check them in.

            let bookings = await getBookingByUserForToday(user.id);
            let hasCheckedIn = false;
            let hasAlreadyCheckedIn = false;
            let hasCompletedBooking = false;
            let checkInErrors = [];

            for (let i = 0; i < bookings.length; i++) {
                const booking = bookings[i];

                // We don't want to check in room bookings automatically, skipping.
                if (booking.type === 'room') {
                    continue;
                }

                // We want to skip bookings that the user has already checked into.
                if (booking.status === 'checkedIn') {
                    hasAlreadyCheckedIn = true;
                    continue;
                }

                // We want to skip bookings that the user has already checked into.
                if (['checkedOut', 'completed'].indexOf(booking.status) >= 0) {
                    hasCompletedBooking = true;
                    continue;
                }

                // We only want to check in bookings in the status 'booked'.
                if (booking.status !== 'booked') {
                    continue;
                }

                // Attempt to check in to the booking.
                try {
                    await bookingCheckin(booking.id, user.id, CHECK_IN_SOURCE);
                    hasCheckedIn = true;
                } catch (e) {
                    console.log('Exception: ', e);
                    checkInErrors.push(e);
                }
            }

            // We now display a message to the user based on the results of the check in attempts.

            // If we have any errors we want to display them to the user, there's two scenarios here:
            //  1. We have checked in some bookings but not all.
            //  2. We have not checked in any bookings.
            // We want to display a different message to the user in each scenario.
            if (checkInErrors.length) {
                let errorMessages = checkInErrors.map(error => {
                    return error.response.data['hydra:description']
                }).join(', ');

                if (hasCheckedIn) {
                    showErrorMessage(`Unable to check into all user bookings, however some booking(s) have been checked in. Error message(s): "${errorMessages}"`);
                } else {
                    showErrorMessage(`An error was encountered when checking into the user booking(s). Error message(s): "${errorMessages}"`);
                }
                return;
            }

            if (!hasCheckedIn) {
                // If the user has already checked in and has an active booking display a success message.
                if (hasAlreadyCheckedIn) {
                    showSuccessMessage('This user has already previously checked into their booking');
                    return;
                }

                // If the user has no active bookings for today (i.e. they have completed all their bookings) display an error message.
                if (hasCompletedBooking) {
                    showErrorMessage('This user has no active desk or onsite bookings, their previous bookings have completed.');
                    return;
                }
            }

            if (hasCheckedIn) {
                // This is the simplest success path, we have checked in the user to their booking(s).
                showSuccessMessage(`User has been checked into their booking(s)`);
            } else {
                // We've not checked in the user to any bookings, this is because they have no bookings for today.
                showErrorMessage('Unable to find any active booking(s) for this user today.');
            }
        });
});