require('dotenv').config();
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');
var http = require('http');
var qs = require('querystring');
var url_re = require('url');
var async = require('async');
var _ = require('lodash');
var moment = require('moment');
var port = process.env.PORT || '8080';
var url = process.env.MONGODB || 'mongodb://localhost:27017/thaipv';
var site_url = process.env.SITE_URL || `http://localhost:${port}`;

var mongoClient = MongoClient.connect(url, function(err, db) {
  var server = http.createServer(function(req, res) {
    function insertDB(data, done) {
      assert.equal(typeof data, 'object');
      assert.ok(Array.isArray(data.province));
      assert.notEqual(data.province.length, 0);
      data = _.pick(data, ['ip', 'province', 'user_input_at']);
      // convert to number and sort ascendingly
      data.province = _.uniq(data.province).map(id => Number(id)).sort((a, b) => b < a);
      if (data.user_input_at) {
        data.user_input_at = moment(data.user_input_at).toDate();
      } else {
        data.user_input_at = new Date();
      }
      data.created_at = new Date();
      db.collection('thaipv').insertOne(data, function(err, result) {
        assert.equal(err, null);
        if (err) {
          done(err);
          return;
        }
        done(null, result.insertedId);
      });
    }

    if (req.method === 'POST' && req.url === '/api/play') {
      // Store map data
      // @params {array} body.province Province ID
      // @params {string} body.user_input_at Date time string when user begin using application
      // @return {object} play stats
      var body = '';
      req.on('data', function(chunk) {
        body += chunk;
      });
      req.on('end', function() {
        let data = JSON.parse(body);
        data.ip = req.headers['x-forwarded-for'] ||
          req.connection.remoteAddress ||
          req.socket.remoteAddress ||
          req.connection.socket.remoteAddress;
        insertDB(data, function(err, map_id) {
          res.writeHead(200);
          res.end(JSON.stringify(JSON.parse('{ "id": "' + map_id + '" }')));
        });

        // Request Format
        // {
        //   "province": ["Bangkok","Ratchaburi","Pattaya","Hua Hin","Chang Mai"]
        // }
        // return
        // {"_id":"595bc2b50ff4f40b6c58428c"}
      });
    } else if (req.method === 'GET' && url_re.parse(req.url).pathname === '/api/play') {
      // Get play stats by ID
      // @params {string} id
      // @return {object} play stats
      var queryy = url_re.parse(req.url, true).query;
      req.on('data', function(chunk) {
        queryy
      });
      req.on('end', function() {
        var query = { _id: new ObjectId(queryy.id) };
        var json_result;

        function getObjectById(id, callback) {
          db.collection("thaipv", function(err, collection) {
            collection.find(id).toArray(callback);
          });
        }

        function getPeopleCount(callback) {
          db.collection("thaipv",  function(err, collection) {
            collection.count(callback);
          });
        }

        function getSumProvince(callback) {
          db.collection("thaipv",  function(err, collection) {
            collection.aggregate([
              {
                "$project": {
                  "province": 1,
                  "sumProvince": { "$size": "$province" }
                }
              },
              {
                "$group": {
                  "_id": null,
                  "sum_province": { "$sum": "$sumProvince" }
                }
              }
            ], callback);
          });
        }

        async.parallel({
          objectById: async.apply(getObjectById, query),
          peopleCount: getPeopleCount,
          sumProvince: getSumProvince
        }, function (error, results) {
          if (error) {
            res.writeHead(500);
            res.end();
            return;
          }
          let json = {
            id: _.get(results, 'objectById.0._id'),
            province: results.objectById[0].province,
            people_count: results.peopleCount,
            avg_province: Math.round(results.sumProvince[0].sum_province/results.peopleCount)
          };
          if (err) throw err;
          res.setHeader('content-type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify(json));
          // return
          // {
          //     "_id": "595bc2e01107fc0b91194404",
          //     "province": [
          //         "Bangkok",
          //         "Ratchaburi",
          //         "Pattaya",
          //         "Hua Hin",
          //         "Chang Mai"
          //     ],
          //     "people_count": 23,
          //     "avg_province": 5
          // }
        });
      });

    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.on("error", err => console.error(err));
  server.listen(port);
  console.log('server: ' + site_url);
});
