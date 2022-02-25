// @Author: Raquel Carmo
// @Date: 25 Oct. 2021
// @Email: raquelarscarmo@gmail.com
// @Script name: no2_era5land_daily_EEA
// @Description: Script to download daily NO2 and ERA5-Land data for EEA monitors.
// @Last modified by: Raquel Carmo
// @Last modified date: 24 Feb. 2022

var firstDate = ee.Date('2018-01-01');
var endDate = ee.Date('2019-12-31');
var folderName = 'collection_per_monitor';

var NO2_collection = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
                        .select('NO2_column_number_density')
                        .filterDate(firstDate, endDate)
                        .map(function (image){
                            return image.set('day', ee.Date(ee.Image(image).get('system:time_start')).format('yyyy-MM-dd'));
                        });
var days = NO2_collection.aggregate_array('day').distinct().sort();
var startDate = days.get(0);


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


function getMetric(y, collection, func, vars) {
    var start = ee.Date(startDate).advance(y, 'days');
    var end   = start.advance(23, 'hours');

    if (func == 'mean') {
        return collection.select(vars).filter(ee.Filter.date(start, end)).mean()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else if (func == 'min') {
        return collection.select(vars).filter(ee.Filter.date(start, end)).min()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else if (func == 'max') {
        return collection.select(vars).filter(ee.Filter.date(start, end)).max()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    } else { //func == 'sum'
        return collection.select(vars).filter(ee.Filter.date(start, end)).sum()
                         .set('Date', ee.Date(startDate).advance(y, 'days'))
                         .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
    }
}


function get_era5land() {
    // difference between start and end in days 
    var numberOfInstances = endDate.difference(ee.Date(startDate), 'day');
    var seqInstances = ee.List.sequence(0, numberOfInstances.subtract(1));

    var collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY');
    var vars = ee.List(['temperature_2m', 'dewpoint_temperature_2m', 'surface_pressure', 'u_component_of_wind_10m', 'v_component_of_wind_10m']);

    var era5_mean = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, collection, 'mean', vars); }));

    var era5_min = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, collection, 'min', 'temperature_2m'); }))
                                     .map(function(image) { return renameBand(image, 'temperature_2m', 'min_temperature_2m'); });

    var era5_max = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, collection, 'max', 'temperature_2m'); }))
                                     .map(function(image) { return renameBand(image, 'temperature_2m', 'max_temperature_2m'); });

    var era5_sum = ee.ImageCollection.fromImages(seqInstances.map(function(y) { return getMetric(y, collection, 'sum', 'total_precipitation'); }));

    // define inner join
    var innerJoin = ee.Join.inner({primaryKey: 'primary', secondaryKey: 'secondary'});
    var filterTimeEq = ee.Filter.equals({leftField: 'Date', rightField: 'Date'});

    var join = innerJoin.apply(era5_mean, era5_min, filterTimeEq).map(concat_join);
    var mid_join = innerJoin.apply(join, era5_max, filterTimeEq).map(concat_join);
    var era5_daily = innerJoin.apply(mid_join, era5_sum, filterTimeEq).map(concat_join);
    return era5_daily;
}


function getMean(y) {
    var start = ee.Date(startDate).advance(y, 'days');
    var end   = start.advance(1, 'days');
    return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
            .select(ee.List(['NO2_column_number_density', 'tropospheric_NO2_column_number_density']))
            .filter(ee.Filter.date(start, end))
            .mean()
            .set('Date', ee.Date(startDate).advance(y, 'days'))
            .set('system:time_start', ee.Date(startDate).advance(y, 'days'));
}

function get_no2() {
    // difference between start and end in days 
    var numberOfDays = endDate.difference(ee.Date(startDate), 'day');
    var seqDays = ee.List.sequence(0, numberOfDays.subtract(1));

    var no2_daily = ee.ImageCollection.fromImages(seqDays.map(getMean));
    return no2_daily;
}


function extract_var(image, location) {
    var stats = ee.Image(image).reduceRegion({
        reducer=ee.Reducer.mean(), 
        geometry=location, 
        scale=1
    });
    var stats1 = stats.map(function(key, val) { return ee.List([val, -999]).reduce(ee.Reducer.firstNonNull()); });
    return ee.Feature(null, stats1.combine({'Date': ee.Date(ee.Image(image).get('system:time_start')).format('yyyy-MM-dd')}));
}


var table = ee.FeatureCollection("users/raquelarscarmo/EEA_monitors");

var era5Land_daily = get_era5land();
var no2_daily = get_no2();

// extract NO2 data for each EEA monitor location
function compute_timeSeries(feature) {

    if (feature.get('AirQualityStationEoICode') != 'IT1680A') {
        continue
    }
    var location = ee.Geometry.Point(feature.get('Longitude'), feature.get('Latitude'));

    var era5Stats = ee.FeatureCollection(era5Land_daily.map(function(image) { return extract_var(image, location); }))
                        .map(addHumidity);
    var no2Stats = ee.FeatureCollection(no2_daily.map(function(image) { return extract_var(image, location); }));

    // join ERA5 Collection and NO2 Collection
    // define a join
    var saveFirst = ee.Join.saveFirst({matchKey: 'match', ordering: 'system:time_start', ascending: true, measureKey: null, outer: true})

    // specify an equals filter for image timestamps
    var filterTimeEq = ee.Filter.equals({leftField: 'Date', rightField: 'Date'})

    var join = saveFirst.apply(era5Stats, no2Stats, filterTimeEq).map(filter_join).map(remove_match)

    var timeSeries = join.map(function(ft) {
        return ft.set({'Countrycode': feature.get('Countrycode'),
                        'AirQualityStation': feature.get('AirQualityStation'),
                        'AirQualityStationEoICode': feature.get('AirQualityStationEoICode')})
    });

    Export.table.toDrive({
            'collection': timeSeries,
            'description': 'NO2_ERA5Land_collection_' + feature.get('AirQualityStationEoICode'),
            'fileFormat': 'CSV',
            'folder': folderName
    });

    // // run tasks automatically (only availably in the Python API)
    // task.start()
    // print(task.status())
}

var timeSeries = table.map(compute_timeSeries);