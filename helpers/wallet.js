module.exports = {
    walletChecker: function(request, response, next) {
        if (request.user.wallet <= 0) {
            response.render('payment', {
                title: 'Payment',
                StripePublishableKey: process.env.StripePublishableKey
            });
        } else {
            return next();
        }
    }
}