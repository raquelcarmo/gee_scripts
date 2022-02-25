// @Author: Raquel Carmo
// @Date: 25 Oct. 2021
// @Email: raquelarscarmo@gmail.com
// @Script name: no2_daily_Brazil
// @Description: Script to download daily ERA5-Land data for Brazilian municipalities.
// @Last modified by: Raquel Carmo
// @Last modified date: 24 Feb. 2022

var startDate = ee.Date('2020-01-01');
var endDate = ee.Date('2021-07-06');
var folderName = 'data';
var collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY');


function concat_join(feature) {
    return ee.Image.cat(feature.get('primary'), feature.get('secondary'));
}


function addHumidity(feature) {
    // dew point (TD), temperature (T) 
    var T = ee.Number(feature.get('temperature_2m')).subtract(273.15);
    var TD = ee.Number(feature.get('dewpoint_temperature_2m')).subtract(273.15);
    var c = ee.Number(243.04);
    var b = ee.Number(17.625);
  
    // FORMULA: 100*Math.exp(c*b*(TD-T)/((c+T)*(c+TD)))
    return feature.set({'humidity': ee.Number(100).multiply((c.multiply(b).multiply(TD.subtract(T)).divide((c.add(T)).multiply(c.add(TD)))).exp())})    
}


function renameBand(image, band, new_band) {
    return image.select([band]).rename([new_band]);
}


function getMetric(y, func, vars) {
    var start = ee.Date(startDate).advance(y, 'days');
    var end   = start.advance(23, 'hours');

    if (func == 'mean') {
        return collection.select(vars).filter(ee.Filter.date(start, end))
                         .mean()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else if (func == 'min') {
        return collection.select(vars).filter(ee.Filter.date(start, end))
                         .min()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else if (func == 'max') {
        return collection.select(vars).filter(ee.Filter.date(start, end))
                         .max()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else { //func == 'sum'
        return collection.select(vars).filter(ee.Filter.date(start, end))
                         .sum()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    }
}


function get_era5land() {
    // difference between start and end in days 
    var numberOfInstances = endDate.difference(ee.Date(startDate), 'day');
    var seqInstances = ee.List.sequence(0, numberOfInstances.subtract(1));

    var vars = ee.List(['temperature_2m', 'dewpoint_temperature_2m', 'surface_pressure', 'u_component_of_wind_10m', 'v_component_of_wind_10m']);

    var era5_mean = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, 'mean', vars); }));

    var era5_min = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, 'min', 'temperature_2m'); }))
                                     .map(function(image) { return renameBand(image, 'temperature_2m', 'min_temperature_2m'); });

    var era5_max = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, 'max', 'temperature_2m'); }))
                                     .map(function(image) { return renameBand(image, 'temperature_2m', 'max_temperature_2m'); });

    var era5_sum = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, 'sum', 'total_precipitation'); }));

    // define inner join
    var innerJoin = ee.Join.inner({primaryKey: 'primary', secondaryKey: 'secondary'});
    var filterTimeEq = ee.Filter.equals({leftField: 'Date', rightField: 'Date'});

    var join = innerJoin.apply(era5_mean, era5_min, filterTimeEq).map(concat_join);
    var mid_join = innerJoin.apply(join, era5_max, filterTimeEq).map(concat_join);
    var era5_land = innerJoin.apply(mid_join, era5_sum, filterTimeEq).map(concat_join);
    return era5_land;
}


function featurize(feature, image) {
    var dict = {'RegionID': feature.get('RegionID'),
                'Date': ee.Date(image.get('system:time_start')).format('yyyy-MM-dd')};

    var properties = ['temperature_2m', 'min_temperature_2m', 'max_temperature_2m', 
                      'dewpoint_temperature_2m', 'surface_pressure', 'u_component_of_wind_10m', 
                      'v_component_of_wind_10m', 'total_precipitation'];

    for(var property in properties) {
        dict[property] = ee.List([feature.get(property), -999]).reduce(ee.Reducer.firstNonNull());
    }
    return ee.Feature(null, dict);
}


function extract_var(image, geometries) {
    var stats = ee.Image(image).reduceRegions({
        'collection': geometries, 
        "reducer": ee.Reducer.mean(), 
        'scale': 9000
    });

    return stats.map(function(feature) { return featurize(feature, ee.Image(image)); });
}


// retrieve table with shapefiles info
var table = ee.FeatureCollection("users/raquelarscarmo/BR_Municipios_2020");

// extract list of regions by code
var regions = table.aggregate_array("CD_MUN").distinct();
var geometries = ee.FeatureCollection(
    table.map(function(feature) { return ee.Feature(feature.geometry(), {'RegionID': feature.get('CD_MUN')}); })
);
//print(geometries.size().getInfo())

// compute daily ERA5-Land
var era5Land_daily = ee.FeatureCollection(get_era5land());

// daily stats from ERA5-Land
var era5LandStats = era5Land_daily.map(function(image) { return extract_var(image, geometries); })
                                  .flatten()
                                  .map(addHumidity);

// export timeseries to Google Drive as csv
Export.table.toDrive({
    'collection': era5LandStats,
    'description': 'ERA5land_daily_Brazil',
    'fileFormat': 'CSV',
    'folder': folderName
});