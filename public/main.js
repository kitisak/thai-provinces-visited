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
  var visited_html = '';
  provinces = data;
  provinces.forEach(function(d, i) {
    d.visited = visited_provinces[d.id - 1] === '1';
    if (d.visited) {
      visited_html += '<li>' + d.provinceTH + '</li>';
    }
  });
  document.getElementById('visited-province-list').innerHTML = visited_html;

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
  var visits = getVisitedProvince();
  var canvas = document.getElementById('canvas');
  canvg(canvas, document.getElementById('map').outerHTML);
  var data64 = canvas.toDataURL('image/png');

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

    FB.ui({
      method: 'share',
      href: site_url + '/view/' + map_id
    }, function(response) {
      // no-op
    });

    setTimeout(function() {
      location.href = site_url + '/view/' + map_id;
    }, 2000);
  })
  .catch(function(err) {
    console.error('parsing failed', err);
  });
}
