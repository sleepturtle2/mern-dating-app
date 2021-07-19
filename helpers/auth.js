module.exports = {
    requireLogin: (request, response, next) => {
        if (request.isAuthenticated()) {
            return next();
        } else {
            response.redirect('/');
        }
    },
    ensureGuest: (request, response, next) => {
        if (request.isAuthenticated()) {
            response.redirect('/profile');
        } else {
            return next();
        }
    }
}