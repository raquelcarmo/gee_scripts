// @Author: Raquel Carmo
// @Date: 1 Feb. 2021
// @Email: raquelarscarmo@gmail.com
// @Script name: download_S1&2
// @Description: Script to download and visualise Sentinel-1 and Sentinel-2 data.
// @Last modified by: Raquel Carmo
// @Last modified date: 1 Feb. 2021

var EARTH_RADIUS  = 6271.0
var DEGREES_TO_RADIANS = 3.1415/180.0
var RADIANS_TO_DEGREE = 180.0/3.1415
var lon = 120//point.coordinates().get(0).getInfo()
var lat = 54//point.coordinates().get(1).getInfo()
var date = ee.Filter.date('2019-12-01', '2019-12-28')
var sizeinkm = 5
var zoom = 12
var foldername = "sentinel1-2"
var rgbVis = {
    min: 0.0,
    max: 5000,
    bands: ['B4', 'B3', 'B2'],
};


// change latitude representation from kms to degrees
function change_in_latitude(kms){
    return (kms/EARTH_RADIUS) * RADIANS_TO_DEGREE;
}

// change longitude representation from kms to degrees
function change_in_longitude(latitude, kms){
    var r = EARTH_RADIUS * Math.cos(latitude * DEGREES_TO_RADIANS)
    return (kms/r) * RADIANS_TO_DEGREE;
}

// input coordinates latitude and longitude belong to the square's centroid;
// size is the square's height/width
function get_coordinates_square(latitude, longitude, size){
    var  half_size = size/2;
    var  slat = latitude + change_in_latitude(-half_size);
    var  nlat = latitude + change_in_latitude(half_size);
    var  wlon = longitude + change_in_longitude(latitude, -half_size);
    var  elon = longitude + change_in_longitude(latitude, half_size);
    
    return [[elon, nlat], [wlon, nlat], [wlon, slat], [elon, slat]];
}


// --------------------- TEST -----------------------
// set the polygon to be extracted
var polygon = get_coordinates_square(lat, lon, sizeinkm);
var geometry = ee.Geometry.Polygon(polygon);
Map.setCenter(lon, lat, zoom);
//Map.addLayer(geometry);

// load Sentinel-1 data bounded by the polygon and dates, select bands VV and VH
var s1dataset = ee.ImageCollection('COPERNICUS/S1_GRD')
                  .filterBounds(geometry)
                  .filter(date)
                  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
                  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
                  .filter(ee.Filter.eq('instrumentMode', 'IW'))
                  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
                  .sort('system:time_start', true)
                  .select(['VV', 'VH']);

// load Sentinel-2 TOA (Top-Of-Atmosphere) reflectance data
var s2dataset = ee.ImageCollection('COPERNICUS/S2')
                  .filter(date)
                  .filterBounds(geometry)
                  .sort('system:time_start', true);


// add layer of Sentinel-2 image data
function addS2Image(img){
    var id = img.id;
    var image = ee.Image(img.id).toDouble();//.toUint16();//.select(['B4', 'B3', 'B2']).toUint16();
    console.log(image)
    
    var s2_name = 'S2-lat_'+lat.toString().replace('.','_')+'_lon_'+lon.toString().replace('.','_')+'-'+image.date().format('yyyy-MM-dd').getInfo();
    var name = s2_name.toString();
    
    // Export.image.toDrive({
    //     image: image,
    //     description: name,
    //     fileNamePrefix: name, 
    //     folder: foldername,
    //     scale: 10,
    //     fileFormat: 'GeoTIFF',
    //     region: geometry,
    // });
    
    Map.addLayer(image.clip(geometry), rgbVis, id);
    //Map.addLayer(image, rgbVis, id);
}

// add layer of Sentinel-1 data
function addS1Image(img){
    var id = img.id;
    var image = ee.Image(img.id).select(['VV', 'VH']);
    
    var s1_name = 'S1-lat_'+lat.toString().replace('.','_')+'_lon_'+lon.toString().replace('.','_')+'-'+image.date().format('yyyy-MM-dd').getInfo();
    var name = s1_name.toString();
    console.log(image)
    
    // Export.image.toDrive({
    //     image: image,
    //     description: name,
    //     fileNamePrefix: name, 
    //     folder: foldername,
    //     scale: 10,
    //     fileFormat: 'GeoTIFF',
    //     region: geometry,
    // });
    
    Map.addLayer(image.clip(geometry), {min: [-25, -25], max: [10, 10]}, id);
}

s2dataset.evaluate(function(s2dataset){
    s2dataset.features.map(addS2Image)
})

// s1dataset.evaluate(function(s1dataset){
//     s1dataset.features.map(addS1Image)
// })