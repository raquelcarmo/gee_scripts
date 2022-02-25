// @Author: Raquel Carmo
// @Date: 24 Aug. 2021
// @Email: raquelarscarmo@gmail.com
// @Script name: download_S5P
// @Description: Script to test download daily NO2 from Sentinel-5P data.
// @Last modified by: Raquel Carmo
// @Last modified date: 13 Sep. 2021

var FirstDate = ee.Date('2018-01-01');
var EndDate = ee.Date('2019-12-31');
var location = ee.Geometry.Point([14.43691476, 48.20944487]);
var no2_vars = ee.List(['NO2_column_number_density', 'tropospheric_NO2_column_number_density']);


// load NO2 data from Sentinel-5P from StartDate to EndDate
var NO2_collection = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
                        .select(no2_vars)
                        .filterDate(FirstDate, EndDate)
                        //.filterBounds(location)
                        .map(function(img) {
                            return img.set('day', ee.Date(ee.Image(img).get('system:time_start')).format('yyyy-MM-dd'));
                        });

var days = NO2_collection.aggregate_array('day').distinct().sort();
//print(days.get(0))

// get actual start date when NO2 data collection began
var startDate = ee.Date(days.get(0))

// difference between start and end in days 
var numberOfDays = EndDate.difference(startDate, 'day');
var seqDays = ee.List.sequence(0, numberOfDays.subtract(1));

// compute daily mean of NO2
var no2_daily = ee.ImageCollection.fromImages(seqDays.map(function(y){
    var start = startDate.advance(y, 'days')
    var end   = start.advance(1, 'days')

    return ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
            .select(no2_vars)
            .filter(ee.Filter.date(start, end))
            .mean()
            .set('Date', startDate.advance(y, 'days'))
            .set('system:time_start', startDate.advance(y, 'days'))
}))
//print(no2_daily.first())

// compute NO2 stats
var extract_stats = function(image) {
    var stats = ee.Image(image).reduceRegion({
        reducer: ee.Reducer.mean(), 
        geometry: location,
        scale: 1
      });
    
    var no2 = ee.List([stats.get('NO2_column_number_density'), null]).reduce(ee.Reducer.firstNonNull())
    var tropo = ee.List([stats.get('tropospheric_NO2_column_number_density'), null]).reduce(ee.Reducer.firstNonNull())

    return ee.Feature(null, ee.Dictionary({'Date': ee.Date(ee.Image(image).get('system:time_start')).format('yyyy-MM-dd'), 
                                           'tropospheric_NO2_column_number_density': tropo,
                                           'NO2_column_number_density': no2
    }))
};


var timeSeries = ee.FeatureCollection(no2_daily.map(extract_stats));
//var list = timeSeries.toList(timeSeries.size());
//print(list.get(0))
//print(list.get(1))

// // export timeSeries to Google Drive as csv
// Export.table.toDrive({
//     collection: timeSeries,
//     description: 'NO2_daily',
//     fileFormat: 'CSV',
//     folder: 'test'
// });