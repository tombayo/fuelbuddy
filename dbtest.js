const MongoClient = require("mongodb").MongoClient
const mongo       = new MongoClient("mongodb://192.168.2.60:27017",{useUnifiedTopology: true})

function init() {
  mongo.connect().then(()=>{
    console.log('Database connected.')
    DBconnected = true
  }).catch(()=>{
    console.log('Database error!')
    DBconnected = false
  })
  process.on('SIGINT', () => {
    mongo.close().then(process.exit)
  })
}

async function saveDataToDB(data, type, id) {

  let db = mongo.db('irsdk-'+type)
  let collection = db.collection(''+id)
  await collection.createIndex({timestamp: 1},{unique:true})

  await collection.insertOne(data)
}

async function findDocuments(dbname, name, query, options) {
  let db = mongo.db(dbname)
  let collection = db.collection(name)
  let cursor = collection.find(query,options)

  if ((await cursor.count()) === 0) console.log('No documents found!')
  
  await cursor.forEach(console.dir)

}

async function findCollections(dbname) {
  let db = mongo.db(dbname)
  await db.listCollections().forEach(console.dir)
}

async function deleteDocument(dbname, name, query) {
  let db = mongo.db(dbname)
  let collection = db.collection(name)
  const result = await collection.deleteOne(query);
  if (result.deletedCount === 1) {
    console.dir("Successfully deleted one document.");
  } else {
    console.log("No documents matched the query. Deleted 0 documents.");
  }
}

async function deleteCollection(dbname, name) {
  let db = mongo.db(dbname)
  let result = await db.dropCollection(name)
  if (result) {
    console.log(name, ' was deleted!')
  } else {
    console.log('Error: ',result)
  }
}
