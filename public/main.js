//Width and height of map
var width = 320;
var height = 640;
var user_input_at = Date.now();

// D3 Projection
var projection = d3.geoAlbers()
  .center([100.0, 13.5])
  .rotate([0, 24])
  .parallels([5, 21])
  .scale(1000 * 2)
  .translate([-100, 200]);

// Define path generator
var path = d3.geoPath() // path generator that will convert GeoJSON to SVG paths
  .projection(projection); // tell path generator to use albersUsa projection

// Define linear scale for output
var color = d3.scaleLinear()
  .domain([0, 1])
  .range(["gainsboro", "#eb307c"]);

//Create SVG element and append map to the SVG
var svg = d3.select("#result")
  .append("svg")
  .attr("id", "map")
  .attr("class", "map")
  .attr("width", width)
  .attr("height", height);

var legendText = ["เคยไป", "ไม่เคยไป"];

// Modified Legend Code from Mike Bostock: http://bl.ocks.org/mbostock/3888852
var legend = svg.append("g")
    .attr("id", "legend")
    .attr("class", "legend")
    .attr("width", 140)
    .attr("height", 100)
    .attr("transform", "translate(200,480)")
    .selectAll("g")
  .data(color.domain().slice().reverse())
    .enter()
    .append("g")
    .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });
        legend.append("rect")
          .attr("width", 18)
          .attr("height", 18)
          .style("fill", color);
        legend.append("text")
          .data(legendText)
            .attr("x", 24)
            .attr("y", 9)
            .attr("dy", ".35em")
            .text(function(d) { return d; });


// Append Div for tooltip to SVG
var tooltip = d3.select("body")
  .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

var geo;
var updateGeo = function(province, visited) {
  for (var i = 0; i < provinces.length; i++) {
    if (provinces[i].province === province) {
      provinces[i].visited = visited;
      break;
    }
  }
  for (var i = 0; i < geo.features.length; i++)  {
    if (province === geo.features[i].properties.NAME_1) {
      if (typeof visited != "undefined") {
        geo.features[i].properties.visited = visited;
        break;
      } else {
        return geo.features[i].properties.visited;
      }
    }
  }
}
var updateMap = function() {
  svg.selectAll("path")
    .style("fill", function(d) {
      var value = d.properties.visited;
      return value ? color(value) : "gainsboro";
    });

  var count = 0;
  provinces.forEach(function(d) {
    if (d.visited) count++;
  });
  document.getElementById('share-btn').disabled = count === 0;
}

var provinces;
var findProvinceTH = function(province) {
  // Find the corresponding province inside the GeoJSON
  for (var i = 0; i < provinces.length; i++)  {
    if (province === provinces[i].province) {
      return provinces[i].provinceTH;
    }
  }
}

// TODO: Load pre-selected province from querystring or DB
var visited_provinces;
if (typeof visited_provinces === 'undefined') {
  visited_provinces = [];
}

d3.csv("public/data/provinces-visited.csv", function(data) {
  var visited_html = [];
  var tovisit_html = [];
  provinces = data;
  provinces.forEach(function(d, i) {
    d.visited = visited_provinces[d.id - 1] === '1';
    if (d.visited) {
      visited_html.push('<li>' + (visited_html.length + 1) + '. <span class="province">'+ d.provinceTH + '</span></li>');
    } else {
      tovisit_html.push('<li>' + (tovisit_html.length + 1) + '. <span class="province">'+ d.provinceTH + '</span></li>');
    }
  });
  document.getElementById('visited-province-list').innerHTML = visited_html.join('\n');
  if (tovisit_html.length > 0) {
    document.getElementById('to-visit-province-list').innerHTML = tovisit_html.join('\n');
  } else {
    document.getElementById('to-visit-province-title').innerHTML = '';
    document.getElementById('mission-complete').innerHTML = '👏👏👏👏👏👏👏👏👏<br>คุณคือสุดยอดคนไทย!<br>👏👏👏👏👏👏👏👏👏';
    var startFirework = initFirework('mission-complete-canvas');
    startFirework();
  }

  // dropdown
  var $provinces = $("#provinces");
  provinces.forEach(function(row) {
    $provinces.append($("<option>", {
      value: row.province,
      text: row.provinceTH
    }));
  });
  // places.forEach(function(row) {
  //   $provinces.append($("<option>", {
  //     value: row.province,
  //     text: row.place
  //   }));
  // });
  $provinces
    .dropdown({
      action: interactive ? 'activate' : 'nothing',
      onAdd: function(value, text, $selectedItem) {
        updateGeo(value, 1);
        updateMap();
      },
      onRemove: function(value, text, $selectedItem) {
        updateGeo(value, 0);
        updateMap();
      }
    });

  // Load GeoJSON data and merge with states data
  d3.json("public/data/thailand-new.json", function(json) {
    geo = json;

    // Loop through each province in the .csv file
    provinces.forEach(function(d) {
      updateGeo(d.province, d.visited);
    });

    // Bind the data to the SVG and create one path per GeoJSON feature
    svg.selectAll("path")
        .data(geo.features)
      .enter()
      	.append("path")
      	.attr("d", path)
      	.style("stroke", "#fff")
      	.style("stroke-width", "1")
        .on("mouseover", function(d) {
            tooltip.transition()
              .duration(200)
              .style("opacity", 0.8);
            tooltip.html(findProvinceTH(d.properties.NAME_1))
              .style("left", (d3.event.pageX) + "px")
              .style("top", (d3.event.pageY - 30) + "px");
          })
        .on("mouseout", function(d) {
            tooltip.transition()
              .duration(500)
              .style("opacity", 0);
          })
        .on("click", function(d) {
            if (!interactive) return;
            if (updateGeo(d.properties.NAME_1) == 0) {
              $("#provinces").dropdown("set selected", d.properties.NAME_1);
              updateGeo(d.properties.NAME_1, 1);
            } else {
              $("#provinces").dropdown("remove selected", d.properties.NAME_1);
              updateGeo(d.properties.NAME_1, 0);
            }
            updateMap();
          });
    updateMap();

    // Add visited provinces to search dropdown too!
    var selected_names = provinces
      .filter(function(d) {
        return d.visited;
      })
      .map(function(d) {
        return d.province;
      });

    $provinces
      .dropdown("set selected", selected_names);
  });
// })
});


function getVisitedProvince() {
  return provinces
    .filter(function(d) {  return d.visited; })
    .map(function(d) { return d.id; });
}

// Convert SVG to PNG
function share() {
  try {
    var visits = getVisitedProvince();
    var canvas = document.getElementById('canvas');
    canvg(canvas, document.getElementById('map').outerHTML);
    var data64 = canvas.toDataURL('image/png');
  } catch (err) {
    // logging
    FB.AppEvents.logEvent("Convert SVG to PNG Error", null, {
      message: err.toString()
    });
    alert('เสียใจจัง เบราเซอร์คุณร่วมสนุกไม่ได้ ลองเปลี่ยนเครื่องแล้วลองใหม่นะ 😢')
    return;
  }

  fetch(site_url + '/api/play', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: data64,
      province: visits,
      t: Date.now() - user_input_at
    })
  })
  .then(function(response) {
    return response.json()
  })
  .then(function(json) {
    var map_id = json.id;
    // logging
    FB.AppEvents.logEvent("Create Travel Map");
    // number of visited provinces
    var params = {};
    params[FB.AppEvents.ParameterNames.LEVEL] = String(visits.length);
    FB.AppEvents.logEvent(
      FB.AppEvents.EventNames.ACHIEVED_LEVEL,
      null,
      params
    );

    setTimeout(function() {
      location.href = site_url + '/view/' + map_id;
    }, 500);
  })
  .catch(function(err) {
    console.error('parsing failed', err);
  });
}

function share_facebook() {
  // logging
  FB.AppEvents.logEvent("Click Share Button");
  FB.ui({
    method: 'share',
    href: location.href,
    mobile_iframe: true,
  }, function(response) {
    // no-op
  });
}




// Firework source code
// @url https://codepen.io/whqet/pen/Auzch
// when animating on canvas, it is best to use requestAnimationFrame instead of setTimeout or setInterval
// not supported in all browsers though and sometimes needs a prefix, so we need a shim

function initFirework(canvas_id) {
  window.requestAnimFrame = ( function() {
    return window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      function( callback ) {
        window.setTimeout( callback, 1000 / 60 );
      };
  })();

  // now we will setup our basic variables for the demo
  var canvas = document.getElementById(canvas_id),
    ctx = canvas.getContext( '2d' ),
    // full screen dimensions
    cw = window.innerWidth,
    ch = window.innerHeight,
    // firework collection
    fireworks = [],
    // particle collection
    particles = [],
    // starting hue
    hue = 120,
    // when launching fireworks with a click, too many get launched at once without a limiter, one launch per 5 loop ticks
    limiterTotal = 5,
    limiterTick = 0,
    // this will time the auto launches of fireworks, one launch per 80 loop ticks
    timerTotal = 80,
    timerTick = 0,
    mousedown = false,
    // mouse x coordinate,
    mx,
    // mouse y coordinate
    my;

  // set canvas dimensions
  canvas.width = cw;
  canvas.height = ch;

  // now we are going to setup our function placeholders for the entire demo

  // get a random number within a range
  function random( min, max ) {
    return Math.random() * ( max - min ) + min;
  }

  // calculate the distance between two points
  function calculateDistance( p1x, p1y, p2x, p2y ) {
    var xDistance = p1x - p2x,
        yDistance = p1y - p2y;
    return Math.sqrt( Math.pow( xDistance, 2 ) + Math.pow( yDistance, 2 ) );
  }

  // create firework
  function Firework( sx, sy, tx, ty ) {
    // actual coordinates
    this.x = sx;
    this.y = sy;
    // starting coordinates
    this.sx = sx;
    this.sy = sy;
    // target coordinates
    this.tx = tx;
    this.ty = ty;
    // distance from starting point to target
    this.distanceToTarget = calculateDistance( sx, sy, tx, ty );
    this.distanceTraveled = 0;
    // track the past coordinates of each firework to create a trail effect, increase the coordinate count to create more prominent trails
    this.coordinates = [];
    this.coordinateCount = 3;
    // populate initial coordinate collection with the current coordinates
    while( this.coordinateCount-- ) {
      this.coordinates.push( [ this.x, this.y ] );
    }
    this.angle = Math.atan2( ty - sy, tx - sx );
    this.speed = 2;
    this.acceleration = 1.05;
    this.brightness = random( 50, 70 );
    // circle target indicator radius
    this.targetRadius = 1;
  }

  // update firework
  Firework.prototype.update = function( index ) {
    // remove last item in coordinates array
    this.coordinates.pop();
    // add current coordinates to the start of the array
    this.coordinates.unshift( [ this.x, this.y ] );

    // cycle the circle target indicator radius
    if( this.targetRadius < 8 ) {
      this.targetRadius += 0.3;
    } else {
      this.targetRadius = 1;
    }

    // speed up the firework
    this.speed *= this.acceleration;

    // get the current velocities based on angle and speed
    var vx = Math.cos( this.angle ) * this.speed,
        vy = Math.sin( this.angle ) * this.speed;
    // how far will the firework have traveled with velocities applied?
    this.distanceTraveled = calculateDistance( this.sx, this.sy, this.x + vx, this.y + vy );

    // if the distance traveled, including velocities, is greater than the initial distance to the target, then the target has been reached
    if( this.distanceTraveled >= this.distanceToTarget ) {
      createParticles( this.tx, this.ty );
      // remove the firework, use the index passed into the update function to determine which to remove
      fireworks.splice( index, 1 );
    } else {
      // target not reached, keep traveling
      this.x += vx;
      this.y += vy;
    }
  }

  // draw firework
  Firework.prototype.draw = function() {
    ctx.beginPath();
    // move to the last tracked coordinate in the set, then draw a line to the current x and y
    ctx.moveTo( this.coordinates[ this.coordinates.length - 1][ 0 ], this.coordinates[ this.coordinates.length - 1][ 1 ] );
    ctx.lineTo( this.x, this.y );
    ctx.strokeStyle = 'hsl(' + hue + ', 100%, ' + this.brightness + '%)';
    ctx.stroke();

    ctx.beginPath();
    // draw the target for this firework with a pulsing circle
    ctx.arc( this.tx, this.ty, this.targetRadius, 0, Math.PI * 2 );
    ctx.stroke();
  }

  // create particle
  function Particle( x, y ) {
    this.x = x;
    this.y = y;
    // track the past coordinates of each particle to create a trail effect, increase the coordinate count to create more prominent trails
    this.coordinates = [];
    this.coordinateCount = 5;
    while( this.coordinateCount-- ) {
      this.coordinates.push( [ this.x, this.y ] );
    }
    // set a random angle in all possible directions, in radians
    this.angle = random( 0, Math.PI * 2 );
    this.speed = random( 1, 10 );
    // friction will slow the particle down
    this.friction = 0.95;
    // gravity will be applied and pull the particle down
    this.gravity = 1;
    // set the hue to a random number +-50 of the overall hue variable
    this.hue = random( hue - 50, hue + 50 );
    this.brightness = random( 50, 80 );
    this.alpha = 1;
    // set how fast the particle fades out
    this.decay = random( 0.015, 0.03 );
  }

  // update particle
  Particle.prototype.update = function( index ) {
    // remove last item in coordinates array
    this.coordinates.pop();
    // add current coordinates to the start of the array
    this.coordinates.unshift( [ this.x, this.y ] );
    // slow down the particle
    this.speed *= this.friction;
    // apply velocity
    this.x += Math.cos( this.angle ) * this.speed;
    this.y += Math.sin( this.angle ) * this.speed + this.gravity;
    // fade out the particle
    this.alpha -= this.decay;

    // remove the particle once the alpha is low enough, based on the passed in index
    if( this.alpha <= this.decay ) {
      particles.splice( index, 1 );
    }
  }

  // draw particle
  Particle.prototype.draw = function() {
    ctx. beginPath();
    // move to the last tracked coordinates in the set, then draw a line to the current x and y
    ctx.moveTo( this.coordinates[ this.coordinates.length - 1 ][ 0 ], this.coordinates[ this.coordinates.length - 1 ][ 1 ] );
    ctx.lineTo( this.x, this.y );
    ctx.strokeStyle = 'hsla(' + this.hue + ', 100%, ' + this.brightness + '%, ' + this.alpha + ')';
    ctx.stroke();
  }

  // create particle group/explosion
  function createParticles( x, y ) {
    // increase the particle count for a bigger explosion, beware of the canvas performance hit with the increased particles though
    var particleCount = 30;
    while( particleCount-- ) {
      particles.push( new Particle( x, y ) );
    }
  }

  // main demo loop
  function loop() {
    // this function will run endlessly with requestAnimationFrame
    requestAnimFrame( loop );

    // increase the hue to get different colored fireworks over time
    //hue += 0.5;

    // create random color
    hue= random(0, 360 );

    // normally, clearRect() would be used to clear the canvas
    // we want to create a trailing effect though
    // setting the composite operation to destination-out will allow us to clear the canvas at a specific opacity, rather than wiping it entirely
    ctx.globalCompositeOperation = 'destination-out';
    // decrease the alpha property to create more prominent trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect( 0, 0, cw, ch );
    // change the composite operation back to our main mode
    // lighter creates bright highlight points as the fireworks and particles overlap each other
    ctx.globalCompositeOperation = 'lighter';

    // loop over each firework, draw it, update it
    var i = fireworks.length;
    while( i-- ) {
      fireworks[ i ].draw();
      fireworks[ i ].update( i );
    }

    // loop over each particle, draw it, update it
    var i = particles.length;
    while( i-- ) {
      particles[ i ].draw();
      particles[ i ].update( i );
    }

    // launch fireworks automatically to random coordinates, when the mouse isn't down
    if( timerTick >= timerTotal ) {
      if( !mousedown ) {
        // start the firework at the bottom middle of the screen, then set the random target coordinates, the random y coordinates will be set within the range of the top half of the screen
        fireworks.push( new Firework( cw / 2, ch, random( 0, cw ), random( 0, ch / 2 ) ) );
        timerTick = 0;
      }
    } else {
      timerTick++;
    }

    // limit the rate at which fireworks get launched when mouse is down
    if( limiterTick >= limiterTotal ) {
      if( mousedown ) {
        // start the firework at the bottom middle of the screen, then set the current mouse coordinates as the target
        fireworks.push( new Firework( cw / 2, ch, mx, my ) );
        limiterTick = 0;
      }
    } else {
      limiterTick++;
    }
  }

  // mouse event bindings
  // update the mouse coordinates on mousemove
  canvas.addEventListener( 'mousemove', function( e ) {
    mx = e.pageX - canvas.offsetLeft;
    my = e.pageY - canvas.offsetTop;
  });

  // toggle mousedown state and prevent canvas from being selected
  canvas.addEventListener( 'mousedown', function( e ) {
    e.preventDefault();
    mousedown = true;
  });

  canvas.addEventListener( 'mouseup', function( e ) {
    e.preventDefault();
    mousedown = false;
  });

  return loop
}
