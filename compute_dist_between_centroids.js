// @Author: Raquel Carmo
// @Date: 8 Oct. 2021
// @Email: raquelarscarmo@gmail.com
// @Script name: compute_dist_between_centroids
// @Description: Script to compute distance between centroids of geometries retrieved from shapefile.
// @Last modified by: Raquel Carmo
// @Last modified date: 8 Oct. 2021

// retrieve table with shapefiles info
var table = ee.FeatureCollection("users/raquelarscarmo/BR_UF_2020")

// loop over table and compute centroid
var distances_df = ee.FeatureCollection(table.map(function(feature){
    var geometryCentroid = feature.geometry().centroid()
    var id = feature.get('CD_UF')

    // loop again over table and compute distance to first centroid
    return table.map(function(f){
        var distance = geometryCentroid.distance({'right': f.geometry().centroid(), 'maxError': 1})

        // create new feature with distances and IDs
        return ee.Feature(null, {'CD_UF': id, 'neighboringState': f.get('CD_UF'), 'distance': distance})
        })
})).flatten()
print(distances_df.first())

// export info as csv
Export.table.toDrive({
    collection: distances_df,
    description:'BR_UF_distCentroids',
    fileFormat: 'CSV',
    selectors: ['CD_UF', 'distance', 'neighboringState']
});

// Export.table.toAsset({
//   collection: distances_df,
//   description:'BR_UF_distCentroids',
//   assetId: 'BR_UF_distCentroids',
// });