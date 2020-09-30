/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser').json()
var path = require('path');
require('dotenv').config();
var mysql = require('mysql');
var cron = require('node-cron');

var PORT = process.env.PORT || 8888;

var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your secret
var redirect_uri = process.env.REDIRECT_URI; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';


  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(path.join(__dirname)))
   .use(cors())
   .use(cookieParser())
   .use(bodyParser);


const db_config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB
};

var connection = mysql.createConnection(db_config);

connection.connect(err =>{
  if(err){
    console.log(err);
  }
});

let pool = mysql.createPool(db_config);

pool.on('connection', function (_conn) {
    if (_conn) {
        logger.info('Connected the database via threadId %d!!', _conn.threadId);
        _conn.query('SET SESSION auto_increment_increment=1');
    }
});

app.get('/', function(req,res){
  res.send('see /tracks to see tracks');
})

app.post('/addTracks', (req, res) => {
  connection.query("DELETE FROM tracks WHERE tracks.PERIOD='"+ req.body[0].period + "' AND tracks.USER='" + req.body[0].user + "';", function (err, result) {
    if (err) throw err;
  });

  req.body.forEach(track => {
    const new_query = "INSERT INTO tracks(USER, TRACK, ARTIST, URI, PERIOD, DATE) VALUES('" + track.user.toLowerCase() + "', '" + track.name + "', '" + track.artist + "', '" + track.uri + "', '" + track.period + "', '" + track.date + "');";

    connection.query(new_query, function (err, result) {
      if (err) throw err;
    });
  });
})

app.post('/getshort_term', (req, res) => {
  const getShortTermTracks="SELECT * FROM TRACKS WHERE TRACKS.USER = '"+ req.body.email +"' AND TRACKS.PERIOD = 'short_term' ORDER BY TRACKS.RANK ASC;";
  connection.query(getShortTermTracks, function (err, result) {
    if (err) throw err;
    res.send(result);
  });
})

app.post('/getmedium_term', (req, res) => {
  const getMediumTermTracks="SELECT * FROM TRACKS WHERE TRACKS.USER = '"+ req.body.email +"' AND TRACKS.PERIOD = 'medium_term' ORDER BY TRACKS.RANK ASC;";
  connection.query(getMediumTermTracks, function (err, result) {
    if (err) throw err;
    res.send(result);
  });
})

app.post('/getlong_term', (req, res) => {
  const getLongTermTracks="SELECT * FROM TRACKS WHERE TRACKS.USER = '"+ req.body.email +"' AND TRACKS.PERIOD = 'long_term' ORDER BY TRACKS.RANK ASC;";
  connection.query(getLongTermTracks, function (err, result) {
    if (err) throw err;
    res.send(result);
  });
})


app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-library-read user-follow-read user-read-recently-played user-read-email user-read-playback-state streaming user-modify-playback-state user-top-read user-read-currently-playing';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});


app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        
        res.redirect('https://whispering-caverns-57172.herokuapp.com/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token 
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

cron.schedule('*/1 * * * *', () => {
  request.delete(
    {
        url: 'https://api.heroku.com/apps/spotifyloginapi/dynos',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.heroku+json; version=3',
            'Authorization': 'Bearer ' + process.env.TOKEN
        }
    },
    function(error, response, body) {
       console.log(error);
    }
);
});


app.listen(PORT, console.log(`Server is starting at ${PORT}`));
