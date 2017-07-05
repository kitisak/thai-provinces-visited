require('dotenv').config();
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');
var http = require('http');
var qs = require('querystring');
var url_re = require('url');
var async = require('async');
var csv_parse = require('csv-parse');
var _ = require('lodash');
var moment = require('moment');
var serveStatic = require('serve-static')
var port = process.env.PORT || '8080';
var url = process.env.MONGODB || 'mongodb://localhost:27017/thaipv';
var site_url = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, '');

// Serve up public folder
function setHeaders (res, path) {
  res.setHeader('x-vendor', 'Boonmee Lab');
}
var servePublicStatic = serveStatic(__dirname + '/public', {
  'setHeaders': setHeaders
});

// View template
var fs = require('fs');
_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;
var template = {
  play: _.template(fs.readFileSync('./public/index.html', 'utf8'))
};
var base_template_data = {
  site_url: site_url,
  current_url: '',
  thumbnail_url: '',
  title: 'มาอวดจังหวัดที่เคยไปกัน!',
  description: 'พิมพ์ชื่อจังหวัดที่เคยไป แล้วแสดงเป็นแผนที่ไปอวดเพื่อนได้เลย! เมืองไทยมีที่เที่ยวมากมาย น้ำตก ทะเล ภูเขา เที่ยวไทย ไม่ไปไม่รู้',
  page: '',
  map_id: '',
  province: [],
  province_name: [],
  avg_province: 0,
  people_count: 99999,
};

// CSV data
var province_list = [];
var province_file = __dirname + '/public/data/provinces-visited.csv';
var csv_parser = csv_parse({
  delimiter: ',',
  columns: true
}, function (err, data) {
  if (err) {
    console.error('parse csv failed:', err);
    return;
  }
  province_list = data;
});
fs.createReadStream(province_file).pipe(csv_parser);

// Amazon AWS
const AWS = require('aws-sdk');
const awsConfig = {};
awsConfig.region = process.env.AWS_REGION;
awsConfig.accessKeyId = process.env.AWS_ACCESS_KEY;
awsConfig.secretAccessKey = process.env.AWS_SECRET;
AWS.config.update(awsConfig);
// S3 (http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!http%3A//docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html)
var s3 = new AWS.S3({
  params: { Bucket: process.env.AWS_BUCKET }
});
var s3_resource_url = 'https://s3-' + process.env.AWS_REGION
  + '.amazonaws.com/' + process.env.AWS_BUCKET + '/';

function notfound(res) {
  res.writeHead(404);
  res.end('หาอะไรอยู่?');
}

var mongoClient = MongoClient.connect(url, function(err, db) {
  var server = http.createServer(function(req, res) {
    function insertDB(data, done) {
      assert.equal(typeof data, 'object');
      assert.ok(Array.isArray(data.province));
      assert.notEqual(data.province.length, 0);
      assert.equal(typeof data.t, 'number');
      data = _.pick(data, ['ip', 'province', 't']);
      // convert to number and sort ascendingly
      data.province = _.uniq(data.province).map(id => Number(id)).sort((a, b) => b < a);
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

    function getStatById(id, done) {
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

      var json_result;
      if (!ObjectId.isValid(id)) {
        done(new Error('พิมพ์ผิดมั้ง'));
        return;
      }
      var query = { _id: new ObjectId(id) };
      async.parallel({
        objectById: async.apply(getObjectById, query),
        peopleCount: getPeopleCount,
        sumProvince: getSumProvince
      }, function (error, results) {
        if (error) {
          done(error);
          return;
        }
        let json = {
          id: _.get(results, 'objectById.0._id'),
          province: _.get(results, 'objectById.0.province'),
          people_count: _.get(results, 'peopleCount'),
          avg_province: Math.round(_.get(results, 'sumProvince.0.sum_province')/_.get(results, 'peopleCount'))
        };
        done(null, json);
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
    }

    function uploadFile(name, buffer, done) {
      var params = {
        Key: name,
        Body: buffer,
        ACL: 'public-read',
        ContentEncoding: 'base64',
        ContentType: 'image/png'
        // other options supported by putObject, except Body and ContentLength.
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      };
      s3.putObject(params, function(err, data) {
        if (err) {
          done(err);
        } else {
          done(null, data);
        }
      });
    }

    var req_path = url_re.parse(req.url).pathname;
    var current_url = site_url + req_path;
    var thumbnail_url = site_url + '/public/thumbnail.jpg';
    var title = '';
    var description = '';
    var route = {
      public: /^\/public(\/.+)$/gi,
      view: /^\/view\/([0-9a-f]+)\/?$/gi,
    };
    var route_public_match = route.public.exec(req_path);
    var route_view_match = route.view.exec(req_path);

    if (req.method === 'GET' && route_public_match) {
      // req.path =
      req.url = route_public_match[1];
      servePublicStatic(req, res, function() {
        notfound(res);
      });
    } else if (req.method === 'POST' && req.url === '/api/play') {
      // @path POST /api/play
      // Store map data
      // @params {array} body.province Province ID
      // @params {number} body.t Time user takes to submit form in ms.
      // @params {string} body.image Base64 encoded image
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

        var image64 = data.image;
        delete data.image;
        insertDB(data, function(err, map_id) {
          var buffer = new Buffer(image64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
          uploadFile(map_id + '.png', buffer, function(upload_err, upload_result) {
            if (upload_err) {
              res.writeHead(500);
              res.end(upload_err.toString());
              return;
            }
            res.writeHead(200);
            res.end(JSON.stringify(JSON.parse('{ "id": "' + map_id + '" }')));
          });
        });

        // Request Format
        // {
        //   "province": ["Bangkok","Ratchaburi","Pattaya","Hua Hin","Chang Mai"]
        // }
        // return
        // {"_id":"595bc2b50ff4f40b6c58428c"}
      });
    } else if (req.method === 'GET' && req_path === '/api/play') {
      // @path GET /api/play
      // Get play stats by ID
      // @params {string} id
      // @return {object} play stats
      var queryy = url_re.parse(req.url, true).query;
      req.on('data', function(chunk) {
        // no-op
      });
      req.on('end', function() {
        getStatById(queryy.id, function(err, result) {
          if (err) {
            res.writeHead(500);
            res.end(err.toString());
            return;
          }
          res.setHeader('content-type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        });
      });

    } else if (req.method === 'GET' && req_path === '/') {
      // @path GET /
      var data = _.merge({}, base_template_data, {
        current_url,
        thumbnail_url,
        page: 'play'
      })
      res.setHeader('content-type', 'text/html');
      res.writeHead(200);
      res.end(template.play(data));

    } else if (req.method === 'GET' && route_view_match) {
      // @path GET /view/:id
      var id = route_view_match[1];
      try {
        getStatById(id, function(err, result) {
          if (err || !result) {
            res.writeHead(500);
            res.end(err.toString());
            return;
          }
          var province_names = _.compact(result.province.map(function(id) {
            return _.get(_.find(province_list, ['id', String(id)]), 'provinceTH');
          }));
          title = 'เคยไปมาแล้ว ' + province_names.length + ' จังหวัด ได้แก่ ' + province_names.join(', ');
          thumbnail_url = s3_resource_url + id + '.png';
          var data = _.merge({}, base_template_data, result, {
            current_url,
            thumbnail_url,
            title,
            description: title,
            page: 'result',
            map_id: id
          })
          res.setHeader('content-type', 'text/html');
          res.writeHead(200);
          res.end(template.play(data));
        });
      } catch(err) {
        res.writeHead(500);
        res.end(err.toString());
      }

    } else {
      notfound(res);
    }
  });
  server.on("error", err => console.error(err));
  server.listen(port);
  console.log('server: ' + site_url);
});

process.on('uncaughtException', err => {
  console.error(err, 'Uncaught Exception thrown');
  process.exit(1);
});
