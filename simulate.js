const app             = require("express")()
const {createSession} = require("better-sse")
const fs              = require("fs")
const bodyP           = require("body-parser")
const cliP            = require('cli-progress')
//const MongoClient     = require("mongodb").MongoClient
//const mongo           = new MongoClient("mongodb://192.168.2.60:27017", {useNewUrlParser:true})
const samplename      = process.argv[2]
const dir             = './sample-data/'+samplename+'/'
const speed           = (typeof(process.argv[3]) !== 'undefined')?process.argv[3]:100
const opt             = {root: __dirname}
const bar             = new cliP.SingleBar({}, cliP.Presets.shades_classic)

var fconf = {telemetryUpdateInterval:1000}
var farr  = []

console.log('Simulation now loading...')
farr = loadSimFromFile(dir)
console.log('Simulation loaded!')
initWebServer()

function loadSimFromFile(directory) {
  console.log('Loading files...')
  let files = fs.readdirSync(directory).sort()
  let returnArr = []
  let progress = 0
  bar.start(files.length,progress)

  for (let i=0;i<files.length;i++) {
    file = files[i]
    if (file == 'record.json') {
      fconf = JSON.parse(fs.readFileSync(directory+file))
    } else {
      let data = JSON.parse(fs.readFileSync(directory+file))
      returnArr.push(data)
    }
    progress++
    bar.update(progress)
  }
  bar.stop()
  console.log('Done loading files!')

  return returnArr

}

function loadSimFromDB(simulationID) {
  mongo.connect((err) => {
    console.log("Loading data from DB...")
    var sessionsdb = mongo.db('irsdk.sessions')
    var telemetrydb = mongo.db('irsdk.telemetry')
  
    db.listCollections({name:simulationID},{nameOnly:true}).toArray((err,r)=>{
      var collection = db.collection(simulationID)
      collection.createIndex({timestamp: 1},{unique:true})
  
      if (r.length == 0) {
        let files = fs.readdirSync(dir)
        files.forEach(file => {
          if (file == 'record.json') {
            fconf = JSON.parse(fs.readFileSync(dir+file))
          } else {
            let data = JSON.parse(fs.readFileSync(dir+file))
            collection.insertOne(data,(err)=>{})
            farr.push(data)
          }
        });
        dbDone()
      } else {
        collection.find().sort({timestamp:1}).toArray(function(err, docs) {
          farr = docs
          dbDone()
        });
      }
      console.log('Data from DB loaded!')
      mongo.close()
      initWebServer()
    })
  });  
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSim(SSEclient, callback) {
  for (data of farr) {
    if (typeof(data.values) !== 'undefined') {
      SSEclient.push('telemetry', data)
      await sleep(speed) // sleeps between sending
    } else if (typeof(data.data) !== 'undefined') {
      SSEclient.push('session', data)
    }
  }
  callback()
}

function initWebServer() {
  app.use(bodyP.json())
  app.get("/", (req, res) => { res.sendFile('client.html',opt) })
  app.get("/client.js", (req, res) => { res.sendFile('client.js',opt) })
  app.get("/client.old.backup.js", (req, res) => { res.sendFile('client.old.backup.js',opt) })
  app.get("/dump", (req, res) => { res.sendFile('dump.html',opt) })
  app.get("/sse", async (req, res) => {
    console.log('Client Connected')
    const client = await createSession(req, res)

    client.push('message','Server: iRacing Simulation running @ '+(fconf.telemetryUpdateInterval/speed)+'x speed.')

    runSim(client, () => {
      client.push('message','Server: Simulation Complete, refresh to repeat.')
      client.push('exit', 'Disconnect please')
      console.log('Simulation Complete')
    })
    
  })
  app.listen(80, () => console.log('Webserver listening on Port 80...'))
}