var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');
var http = require('http'),
    qs = require('querystring');
var url_re = require('url');
var async = require('async');

var url = "mongodb://localhost:32770/thaipv";

var mongoClient = MongoClient.connect(url, function(err, db) {
  var server = http.createServer(function(req, res) {
    function insertDB(json, insertedId) {
      var insertDocument = function(db, callback) {
        db.collection('thaipv').insertOne( {
            "province": json
        }, function(err, result) {
          assert.equal(err, null);
          insertedId(result.insertedId);
          console.log("Inserted a document into the restaurants collection.");
        });
      };
      assert.equal(null, err);
      insertDocument(db);
    }

    if (req.method === 'POST' && req.url === '/send') {
      var body = '';
      req.on('data', function(chunk) {
        body += chunk;
      });
      req.on('end', function() {
        let json_body = JSON.parse(body);
        insertDB(json_body.province, function(insertDB) {
          console.log(insertDB)
          res.writeHead(200);
          res.end(JSON.stringify(JSON.parse('{ "_id": "' + insertDB + '" }')));
        });

        // Request Format
        // {
        //   "province": ["Bangkok","Ratchaburi","Pattaya","Hua Hin","Chang Mai"]
        // }
        // return
        // {"_id":"595bc2b50ff4f40b6c58428c"}
      });
    } else if (req.method === 'GET' && url_re.parse(req.url).pathname === '/get') {
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
            res.status(500).send(error);
            return;
          }
          let json = {
            _id: results.objectById[0]._id,
            province: results.objectById[0].province,
            people_count: results.peopleCount,
            avg_province: Math.round(results.sumProvince[0].sum_province/results.peopleCount)
          };
          if (err) throw err;
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
  server.listen(8090);
});


