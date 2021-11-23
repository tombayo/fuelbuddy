const SSE   = require("sse-node")
const app   = require("express")()
const fs    = require("fs")
const path  = require("path")
const irsdk = require("node-irsdk")
const bodyP = require("body-parser")
const conf  = {timestamp: Date.now(),telemetryUpdateInterval: 500, sessionInfoUpdateInterval: 15000}
const opt   = {root: __dirname}
const CLarg = (typeof(process.argv[2]) === 'undefined') ? false:process.argv[2]

const { MongoClient } = require("mongodb")
const mongo           = new MongoClient("mongodb://192.168.2.60:27017",{useUnifiedTopology: true})

irsdk.init(conf)

var DBconnected       = false
var SSEconnected      = false
var iRacingConnected  = false
var iRacing           = irsdk.getInstance()
var trackSession      = {id:0,tick:0}

function SSEsend(data, type) {
  if (SSEconnected) SSEconnected.send(data,type)
}

function handleData(data) {
  let type = (typeof(data.values) !== 'undefined')?'telemetry':(typeof(data.data) !== 'undefined')?'session':null

  SSEsend(data,type)
  saveDataToFile(data, type)

  if (type == 'telemetry') {
    // new tick is lower than the last, session must've changed. set to 0 til we get new ID from session data:
    if (data.values.SessionTick < trackSession.tick) trackSession.id = 0
    
    if (trackSession.id) { // Do we have a session ID to pin telemetry data to?
      trackSession.tick = data.values.SessionTick // update the tick-tracking to sense session-change.
    }

  } else if (type == 'session') {
    trackSession.id = data.data.WeekendInfo.SubSessionID
    saveDataToDB(conf, 'meta', trackSession.id).catch(console.dir) // saves the config in the meta-db
  }

  if (trackSession.id) saveDataToDB(data,type,trackSession.id).catch(console.dir) // only when we have our session ID, data gets saved in db

}

function ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

async function saveDataToDB(data, type, id) {
  /**
   * DBs:
   * irsdk-telemetry - for telemetry-feed
   * irsdk-session - for sessionInfo data
   * irsdk-meta - for config and calculated data
   * 
   * Each collection is named by SubSessionID
   */

  if (DBconnected) {
    let db = mongo.db('irsdk-'+type)
    let collection = db.collection(''+id)

    await collection.createIndex({timestamp: 1},{unique:true})
    await collection.updateOne({timestamp:data.timestamp},data,{upsert:true})
    //await collection.insertOne(data) <-- old code for reference, might need to swap it for quick debug.
  }
}

function saveDataToFile(data, type) {
  if (CLarg) {
    var confFile = './sample-data/'+CLarg+'/record.json'
    fs.stat(confFile, function(err){
      if (err != null) {
        if (err.code == 'ENOENT') {
          fs.writeFile(confFile, JSON.stringify(conf), err=>{if(err) throw err})
        }
      }
    })

    var fileName = './sample-data/'+CLarg+'/'+Date.now()+'-'+type+'.json'
    ensureDirectoryExistence(fileName)
    fs.writeFile(fileName, JSON.stringify(data), function (err) {
      if (err) throw err
    })
  }
}

setInterval(() => {
  if (!iRacingConnected) console.log('Waiting for iRacing...')
  if (!SSEconnected) console.log('Waiting for Client...')
  if (!iRacingConnected) SSEsend('Server: Waiting for iRacing...','message')
},15000)

// Database stuff below:
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

// iRacing stuff below:
iRacing.on('Connected',() => {
  console.log('iRacing connected.')
  SSEsend('Server: iRacing Connected.', 'message')
  iRacingConnected = true
})
iRacing.on('Disconnected',() => {
  console.log('iRacing disconnected.')
  SSEsend('Server: iRacing Disconnected.', 'message')
  iRacingConnected = false 
})
iRacing.on('Telemetry', handleData)
iRacing.on('SessionInfo', handleData)

// Web server stuff below:
app.use(bodyP.json())
app.get("/", (req, res) => { res.sendFile('client.html',opt) })
app.get("/client.js", (req, res) => { res.sendFile('client.js',opt) })
app.get("/sse", (req, res) => {
  console.log('Client Connected')
  const client = SSE(req, res)
  SSEconnected = client

  if (iRacingConnected) {
    client.send('Server: iRacing connected.', 'message')
  }

  client.onClose(() => SSEconnected = false)
})
app.listen(80, () => console.log('Listening on Port 80...'))