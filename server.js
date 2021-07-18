const express = require('express')
const hbs = require('express-handlebars');
const app = express();
//environment variable for port
const port = process.env.PORT || 3000;

//setup view engine
app.engine('handlebars', hbs({}));
app.set('view engine', 'handlebars');

app.get('/', (request, response) => {
    response.render('home', {
        title: 'Home'
    });
});

app.get('/about', (request, response) => {
    response.render('about', {
        title: 'About'
    });
});

app.get('/contact', (request, response) => {
    response.render('contact', {
        title: 'Contact'
    });
})
app.listen(port, () => {
    console.log('Server is running on port ' + port);
})