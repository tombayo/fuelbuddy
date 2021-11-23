{ // Our Globals:
  var ee                = new EventEmitter()
  var DB                = {}
  var currentLap        = -1
  var currentLapLLT     = -1
  var currentSession    = -1
  var currentSubSession = -1
  var S                 = false
  var T                 = false
  var simtime           = 0
  var timemeasures      = {}
  var pittimer          = 0
  var boxtimer          = 0
  var incidentcount     = 0
  var energymax         = 0
  var energylapmax      = 0
  var fuelKGltrfactor   = 0.75
  var fuelUnit          = 'kg'
}

String.prototype.toCamelCase = function() {
  return this.replace(/^([A-Z])|[\s-_]+(\w)/g, function(match, p1, p2, offset) {
      if (p2) return p2.toUpperCase()
      return p1.toLowerCase()
  });
}
function numPadding(num, len, char) {
  let repnum = (len-(''+parseInt(num)).length)
  return parseInt(num) > '9'.repeat(len-1) ? num:char.repeat(repnum<0?0:repnum)+num
}
function lapTimeFormat(time) {
  let min = parseInt(time/60)
  let sec = time % 60
  return (min ? numPadding(min, 2, '&nbsp;') + ':': '&nbsp;&nbsp;&nbsp;') + numPadding(sec.toFixed(3),2,'0')
}
function sessionTimeFormat(time) {
  let hour = parseInt(time / 3600)
  let min = parseInt((time % 3600) / 60)
  let sec = time % 60
  return numPadding(hour,2,'0') + ':' + numPadding(min,2,'0') + ':' + numPadding(sec.toFixed(0),2,'0')
}
function median(values) {
  values.sort((a,b) => { return a - b })
  let half = Math.floor(values.length/2)
  if(values.length % 2)
      return values[half];
  else
      return (values[half-1] + values[half]) / 2.0;
}
function makeLapRow(lap) {
  let tr = document.createElement('tr')
  tr.innerHTML = `
    <td>`+numPadding(lap,3,'&nbsp;')+`</td>
    <td class="laptimes" id="lap`+lap+`"></td>
    <td class="lapfuels" id="lap`+lap+`-fuel"><span></span></td>
    <td class="lapfuelcons" id="lap`+lap+`-fuelcon"></td>
    <td class="lapincs" id="lap`+lap+`-inc"></td>`
  return tr
}
function makePitTimeRow(lap) {
  let tr = document.createElement('tr')
  tr.innerHTML = `
    <td>`+numPadding(lap,3,'&nbsp;')+`</td>
    <td class="pittimes" id="pittimer`+lap+`"></td>
    <td class="boxtimes" id="boxtimer`+lap+`"></td>
    <td class="pittimefuels" id="pittimer`+lap+`-fuel"></td>`
  return tr
}
function updateTimer() {
  let lapTime = T.LapCurrentLapTime
  if (currentLap > 0 && lapTime != 0) {
    document.getElementById('lap'+currentLap).innerHTML = lapTimeFormat(lapTime)
  }
}
function updateFuel() {
  let currentFuel   = T.FuelLevel*fuelKGltrfactor
  let lastFuel      = document.getElementById('lap'+(currentLap-1)+'-fuel')
  let lastFuelCheck = lastFuel ? lastFuel.getAttribute('data-rawval') : 0
  let usedFuel      = lastFuelCheck - currentFuel

  usedFuel = usedFuel ? usedFuel : 0 // Sometimes NaN, defaults to 0 in such case
  
  {
  /** 
    * Old code, kept for furure need:
    * Used for adding a badge next to the fuel-level to visualize amount of fuel filled.
    * Never accurate though, becase set refill-value isn't always actual amount refueled.
  if (usedFuel < 0) {
    usedFuel = usedFuel + fuelRefill
    if (!document.getElementById('refill-'+currentLap)) {
      let spanwrap = document.createElement('span')
      let span     = document.createElement('span')
      spanwrap.id = 'refill-'+currentLap
      spanwrap.classList.add('h5')
      span.classList.add('badge', 'badge-pill', 'badge-warning')
      span.style.position = 'absolute'
      span.innerHTML = '+'+fuelRefill.toFixed(1)
      spanwrap.appendChild(span)
      document.getElementById('lap'+currentLap+'-fuel').appendChild(spanwrap)
      document.getElementById('lap'+currentLap+'-fuelcon').setAttribute('data-refill','true')
    }
  }
  */
  }

  if (usedFuel < 0) {
    // Prevent this lap from counting towards average consumption, @see calculations()
    document.getElementById('lap'+currentLap+'-fuelcon').setAttribute('data-refill','true')
    document.getElementById('lap'+currentLap).parentElement.classList.add('pitLap')

    // Adds the refueled amount to the calculated usedfuel value, as measured in measureBoxtime():
    let refuelMeasure = document.getElementById('pittimer'+(currentLap-1)+'-fuel')
    let refillAmount = refuelMeasure ? refuelMeasure.getAttribute('data-rawval') : 0
    usedFuel = usedFuel + parseFloat(refillAmount)
  }

  let fuel    = document.getElementById('lap'+currentLap+'-fuel')
  let fuelcon = document.getElementById('lap'+currentLap+'-fuelcon')
  if (fuel) {
    fuel.setAttribute('data-rawval', currentFuel)
    fuel.firstElementChild.innerHTML = currentFuel.toFixed(2)
  }
  if (fuelcon) {
    fuelcon.setAttribute('data-rawval', usedFuel)
    fuelcon.innerHTML = usedFuel.toFixed(2)
  }
}
function updateIncidents() {
  let incs        = T.PlayerCarTeamIncidentCount
  let newincs     = incs - incidentcount
  let incEL       = document.getElementById('lap'+currentLap+'-inc')
  let incsThislap = parseInt(incEL.getAttribute('data-lapincs'))
  let maxincs     = S.WeekendInfo.WeekendOptions.IncidentLimit
  document.getElementById('status-maxincs').innerHTML = (maxincs=='unlimited') ? '∞' : maxincs+'x'

  newincs = (newincs > 0) ? newincs:0 // Negative incident count is an artifact of new session
  incidentcount = incs
  if (!incsThislap) {
    incsThislap = newincs
  } else {
    incsThislap += newincs
  }

  incEL.setAttribute('data-lapincs', incsThislap)
  incEL.innerHTML = incsThislap ? incsThislap+'x': ''
}
function updateLastLap() {
  let lastLaptime = T.LapLastLapTime
  if (lastLaptime > 0) {
    let lapEL = document.getElementById('lap'+(currentLap-1))
    lapEL.setAttribute('data-rawlaptime', lastLaptime)
    lapEL.innerHTML = lapTimeFormat(lastLaptime)
  }
}
function calcAverageLapTime(numlaps) {
  let laps         = [...document.querySelectorAll('.laptimes')].slice(1,numlaps+1)
  let totallaptime = 0
  let avglaptime   = 0

  let timedlaps = laps.filter((e)=>e.getAttribute('data-rawlaptime'))
  timedlaps.forEach((e)=>totallaptime += parseFloat(e.getAttribute('data-rawlaptime')))
  avglaptime = totallaptime / timedlaps.length

  return avglaptime
}
function calcTotalRaceLength() {
  let medianlaptime = document.getElementById('calcs-lapmed').getAttribute('data-rawval')
  let avgfuel = document.getElementById('calcs-fuelavg').getAttribute('data-rawval')
  let selectedLength = document.getElementById('selectTotalRaceLength').value
  let lengthInSecs = selectedLength*60
  
  let totallaps = lengthInSecs/parseFloat(medianlaptime)
  let totalfuel = totallaps*parseFloat(avgfuel)

  totallaps = (isNaN(totallaps))?0:totallaps
  totalfuel = (isNaN(totalfuel))?0:totalfuel

  document.getElementById('calcs-totalfuel').innerHTML = Math.ceil(totalfuel)
  document.getElementById('calcs-totalfuelunit').innerHTML = fuelUnit
  document.getElementById('calcs-totallaps').innerHTML = Math.ceil(totallaps)
}
function calcTimeRemains() {
  // Is the time left of session fixed or does the session have a fixed length of laps?
  if (T.SessionLapsRemainEx == 32757) {
    
  }
  // if time left of session is fixed:
  // remaningTime = remaining time left of session

  // if session has fixed length of laps:
  // estimate session length based on average lap time and laps remaining

  return remainingTime
}
function checkLapFastestLaptime() {
  if ((T.LapBestLapTime == T.LapLastLapTime) && (T.LapBestLapTime != 0)) {
    let fastestLapEL = document.getElementById('fastestLap')
    
    if (fastestLapEL) {
      fastestLapEL.removeAttribute('id')
    }
    document.getElementById('lap'+(currentLap-1)).parentElement.setAttribute('id','fastestLap')
  }
}
function updateMedianLapTime() {
  let lapmedEL = document.getElementById('calcs-lapmed')
  let laptimes = []
  let laps     = [...document.querySelectorAll('.laptimes')]

  let timedlaps = laps.filter((e)=>e.getAttribute('data-rawlaptime'))
  timedlaps.forEach((e)=>laptimes.push(parseFloat(e.getAttribute('data-rawlaptime'))))

  let medianlaptime = median(laptimes)

  lapmedEL.setAttribute('data-rawval', medianlaptime)
  lapmedEL.innerHTML = lapTimeFormat(medianlaptime)

  return medianlaptime
}
function updateRemainingLaps() {
  let medianlaptime = parseFloat(document.getElementById('calcs-lapmed').getAttribute('data-rawval'))
  let remaininglaps = (T.SessionTimeRemain / medianlaptime)+1 // +1 for the whiteflag-lap
  document.getElementById('calcs-lapsleft').innerHTML = '≈'+(Math.ceil(remaininglaps)) 
  document.getElementById('calcs-lapsleft').setAttribute('data-rawval', remaininglaps)
  document.getElementById('status-lapstotal').innerHTML = '≈'+(Math.ceil(remaininglaps)+currentLap)

  return remaininglaps
}
function updateAverageFuelConsumption() {
  let fuelavgEL  = document.getElementById('calcs-fuelavg')
  let totalfuel = 0
  let avgfuel   = 0

  let fueledlaps = [...document.querySelectorAll('.lapfuelcons')].filter((e)=>{
    return e.getAttribute('data-refill') != 'true'
  }).slice(1,4) // Last 3 laps, counted from last lap
  fueledlaps.forEach((e)=>totalfuel += parseFloat(e.getAttribute('data-rawval')))
  avgfuel = totalfuel / fueledlaps.length

  fuelavgEL.setAttribute('data-rawval', avgfuel)
  fuelavgEL.innerHTML = avgfuel.toFixed(3)

  return avgfuel
}
function updateLapsOnRemainingFuel() {
  let fuellapsEL = document.getElementById('calcs-fuellaps')
  let avgfuel = parseFloat(document.getElementById('calcs-fuelavg').getAttribute('data-rawval'))
  let fuellaps = T.FuelLevel*fuelKGltrfactor / avgfuel

  fuellapsEL.setAttribute('data-rawval', fuellaps)
  fuellapsEL.innerHTML = fuellaps.toFixed(2)

  return fuellaps
}
function updateFuelToFinish() {
  let fuelneedEL = document.getElementById('calcs-fuelneed')
  let remaininglaps = parseFloat(document.getElementById('calcs-lapsleft').getAttribute('data-rawval'))
  let avgfuel = parseFloat(document.getElementById('calcs-fuelavg').getAttribute('data-rawval'))
  let fuellaps = parseFloat(document.getElementById('calcs-fuellaps').getAttribute('data-rawval'))

  let lapneed   = remaininglaps - fuellaps
  let fuelneed  = lapneed * avgfuel

  fuelneedEL.setAttribute('data-rawval', fuelneed)
  fuelneedEL.innerHTML = fuelneed.toFixed(3)

  return fuelneed
}
function updateStatus(){
  document.getElementById('status-sesstime').innerHTML = sessionTimeFormat(T.SessionTime)
  document.getElementById('status-currentlap').innerHTML = T.Lap
  document.getElementById('status-timeleft').innerHTML = sessionTimeFormat(T.SessionTimeRemain)
  document.getElementById('status-incidents').innerHTML = T.PlayerCarTeamIncidentCount
  document.getElementById('status-tracktemp').innerHTML = T.TrackTempCrew.toFixed(1) + '°C'
  document.getElementById('clock').innerHTML = moment(simtime).format('YYYY.MM.DD HH:mm:ss')
}
function timeTriggers(){
  timemeasures.utime = new Date(simtime).getTime()

  if (typeof(timemeasures.OneSec) == 'undefined') {
    timemeasures.OneSec = timemeasures.utime
  } else if (timemeasures.OneSec <= timemeasures.utime) {
    timemeasures.OneSec = timemeasures.utime+1000
    ee.emit('onesecTick')
  }

  if (typeof(timemeasures.FiveSec) == 'undefined') {
    timemeasures.FiveSec = timemeasures.utime
  } else if (timemeasures.FiveSec <= timemeasures.utime) {
    timemeasures.FiveSec = timemeasures.utime+5000
    ee.emit('fivesecTick')
  }

  if (typeof(timemeasures.TenSec) == 'undefined') {
    timemeasures.TenSec = timemeasures.utime
  } else if (timemeasures.TenSec <= timemeasures.utime) {
    timemeasures.TenSec = timemeasures.utime+10000
    ee.emit('tensecTick')
  }

}
function updateHybrid() {
  let energyNow = T.EnergyERSBattery
  let energyLap = T.EnergyBatteryToMGU_KLap

  if (typeof(energyNow) === "undefined") {
    return false
  } else {
    document.getElementById('hybrid-card').classList.remove('d-none') // enables UI

    energymax = (energyNow > energymax) ? energyNow:energymax
    energylapmax = (energyLap > energylapmax) ? energyLap:energylapmax
    document.getElementById('status-energynow').innerHTML = (energyNow/1000).toFixed(0)+' kJ'
    document.getElementById('status-energylap').innerHTML = (energyLap/1000).toFixed(0)+' kJ'
    document.getElementById('status-energynow-percent').innerHTML = ((energyNow/energymax)*100).toFixed(1)+' %'
    document.getElementById('status-energylap-percent').innerHTML = ((energyLap/energylapmax)*100).toFixed(1)+' %'
  }
}
function measurePitTime() {
  let inPitLane   = T.OnPitRoad
  let surface     = T.PlayerTrackSurface
  let sessionTime = T.SessionTime
  let lap         = T.Lap

  if (inPitLane && !pittimer && (surface != "InPitStall")) {
    pittimer = {  // starts the timer
      time: sessionTime,
      lap: lap,
      boxtimer: 0,
      fuelprebox: 0,
      fuelpostbox: 0
    }
    // preps a new row:
    let pittimeTBL = document.getElementById('measure-pittime')
    pittimeTBL.insertBefore(makePitTimeRow(lap),pittimeTBL.childNodes[0])
  } else if (inPitLane && pittimer) { // 
    let dur = sessionTime - pittimer.time
    let pittimeEL = document.getElementById('pittimer'+pittimer.lap)
    pittimeEL.setAttribute('data-rawval', dur)
    pittimeEL.innerHTML = lapTimeFormat(dur)

    // handle the seperate pitbox timer:
    measurePitboxTime(pittimer, surface, sessionTime)
  } else if (!inPitLane && pittimer) {
    let refuel = pittimer.fuelpostbox - pittimer.fuelprebox
    let pittimefuelEL = document.getElementById('pittimer'+pittimer.lap+'-fuel')
    pittimefuelEL.setAttribute('data-rawval', refuel)
    pittimefuelEL.innerHTML = (refuel > 0)?refuel.toFixed(3):'-'

    if (!document.getElementById('boxtimer'+pittimer.lap).getAttribute('data-rawval')) {
      // never entered box, this must be the outlap, removing time:
      document.getElementById('measure-pittime').childNodes[0].remove()
    }

    pittimer = 0 // reset
  }
}
function measurePitboxTime(pittimer, surface, sessionTime) {
  if (!pittimer.boxtimer && (surface == "InPitStall")) { // start the timer
    pittimer.boxtimer = sessionTime
    pittimer.fuelprebox = T.FuelLevel*fuelKGltrfactor
  } else if (pittimer.boxtimer && (surface == "InPitStall")) {
    let dur = sessionTime - pittimer.boxtimer
    let pittimeboxEL = document.getElementById('boxtimer'+pittimer.lap)
    pittimeboxEL.setAttribute('data-rawval', dur)
    pittimeboxEL.innerHTML = lapTimeFormat(dur)
  } else if (pittimer.boxtimer && (surface != "InPitStall")) {
    pittimer.boxtimer = 0 // reset
    pittimer.fuelpostbox = T.FuelLevel*fuelKGltrfactor
  }
}
function resetPitTimer() {
  pittimer = 0 // resets the pit timer if not on track or is in garage
}
function pushNewLap() {
  if (!document.getElementById('lap'+T.Lap)) {
    let el = document.getElementById('laps')
    el.insertBefore(makeLapRow(T.Lap),el.childNodes[0])
  }
}
function raceFinishing() {
  var listeners = ee.flattenListeners(ee.getListeners('newlaptiming'))
  if (listeners.indexOf(raceOver) == -1) {
    ee.on('newlaptiming',raceOver) // Wait for last laptime to arrive, then run raceOver
  }
}
function raceOver() {
  let laptimes  = []
  let laps      = [...document.querySelectorAll('.laptimes')]
  let timedlaps = laps.filter((e)=>e.getAttribute('data-rawlaptime'))

  if (timedlaps.length < 2) return null // not enough data to continue

  timedlaps.forEach((e)=>laptimes.push(parseFloat(e.getAttribute('data-rawlaptime'))))
  let medianlaptime = median(laptimes)

  let totalfuel = 0
  let fueledlaps = [...document.querySelectorAll('.lapfuelcons')].filter((e)=>{
    return e.getAttribute('data-refill') != 'true'
  }).slice(1,-1)// Gets the laps, exluding current lap, and first lap
  fueledlaps.forEach((e)=>totalfuel += parseFloat(e.getAttribute('data-rawval')))
  let avgfuel = totalfuel / fueledlaps.length

  let jsondata = {
    session: {
      id: S.WeekendInfo.SubSessionID,
      name: S.SessionInfo.Sessions[T.SessionNum].SessionName,
      trackname: S.WeekendInfo.TrackName,
      length: timedlaps.length,
      avgfuel: avgfuel
    },
    lapstats: {
      median: medianlaptime,
      best: laptimes.sort()[0]
    },
    car: {
      name: S.DriverInfo.Drivers[S.DriverInfo.DriverCarIdx].CarScreenNameShort
    }
  }

  console.log('Race Over! Dumping stats:')
  console.log('Race length:', timedlaps.length)
  console.log('Avg fuelconsumption:', avgfuel.toFixed(2))
  console.log('Median laptime:', lapTimeFormat(medianlaptime).replace('&nbsp;',''))
  console.log('Best laptime:', lapTimeFormat(laptimes.sort()[0]).replace('&nbsp;',''))
  console.log(jsondata)
  console.log(S)

  return true // When called by EventEmitter, run only once
}
function flagCheck() {
  // Checkered, White, Blue, Green, OneLapToGreen, Black, Disqualify, Furled, Servicible, StartHidden, Caution

  if (T.SessionFlags.indexOf('Checkered') > -1)  {
    ee.emit('checkeredFlag')
  }

  if (T.SessionFlags.indexOf('Disqualify') > -1) {
    ee.emit('disqualifyFlag')
  }
}
function newSession() {
  raceOver()
  ee.removeListener('newlaptiming',raceOver) // Clears the listener for the new session

  // Reset some globals:
  currentSession = T.SessionNum
  currentSubSession = S.WeekendInfo.SubSessionID
  currentLap = -1
  currentLapLLT = -1
  pittimer = 0
  incidentcount = 0

  var driveruserid  = S.DriverInfo.DriverUserID
  var trackname     = S.WeekendInfo.TrackName
  var tracknameshort= S.WeekendInfo.TrackDisplayShortName
  var carname       = S.DriverInfo.Drivers[S.DriverInfo.DriverCarIdx].CarScreenNameShort

  document.getElementById('sessionNum').innerHTML = '<a href="http://members.iracing.com/membersite/member/EventResult.do?&subsessionid='+currentSubSession+'&custid='+driveruserid+'" target="_blank">'+currentSubSession+'</a>'
  document.getElementById('sessionName').innerHTML = S.SessionInfo.Sessions[T.SessionNum].SessionName
  document.getElementById('trackname').innerHTML = trackname
  document.getElementById('tracknameshort').innerHTML = tracknameshort
  document.getElementById('carname').innerHTML = carname

  document.getElementById('laps').innerHTML = makeLapRow(currentLap).outerHTML
  document.getElementById('measure-pittime').innerHTML = ""
}
function updateKGltr() {
  fuelUnit = document.querySelector('input[name="KGltrRadio"]:checked').value
  fuelKGltrfactor = (fuelUnit == 'ltr')?1:S.DriverInfo.DriverCarFuelKgPerLtr
}

function SSEdisconnected() {
  $('#localstatus').html('SSE: Disconnected.')
}
function SSEerror() {
  SSEdisconnected()
  setTimeout(()=>{ SSEinit, 5000})
}
function SSEexit(es) {
  SSEdisconnected()
  es.close()
}
function SSEmessage(data) {
  document.getElementById('serverstatus').innerHTML = data
}
function SSEtelemetry(data) {
  simtime   = data.timestamp
  T         = data.values

  if (!S) return null // We need the SessionInfo-data before continuing.

  ee.emit('teletick') // Triggers each telemetry tick

  if (!T.IsInGarage && T.IsOnTrackCar) { // Is car on track?


    if ((currentSession != T.SessionNum) || (currentSubSession != S.WeekendInfo.SubSessionID)) {
      ee.emit('newsession') // session has changed
    }
    if (currentLap != T.Lap) {
      currentLap = T.Lap
      ee.emit('newlap') // lap has changed
    }
    if (currentLapLLT != T.Lap && T.LapCurrentLapTime < 10) {
      currentLapLLT = T.Lap
      ee.emit('newlaptiming') // last lap time has come in
    }

    ee.emit('teletickOnTrack')
    
  } else {
    ee.emit('teletickNotOnTrack')
  }

}
function SSEsession(data) {
  S = data.data
}
function SSEinit() {
  $('#localstatus').html('SSE: Connecting...')
  var es = new EventSource('/sse')

  es.addEventListener('open', (e) => { $('#localstatus').html('SSE: Connected.') })
  es.addEventListener('error', (e) => { SSEerror() })
  es.addEventListener('message', (e) => { SSEmessage(JSON.parse(e.data)) })
  es.addEventListener('telemetry', (e) => { SSEtelemetry(JSON.parse(e.data)) })
  es.addEventListener('session', (e) => { SSEsession(JSON.parse(e.data)) })
  es.addEventListener('exit', (e) => { SSEexit(es) })
}
function EventInit() {
  ee.addListeners({
    teletick: [ // run each telemetry tick
      timeTriggers
    ],
    onesecTick: [ // runs each second as long as telemetry is running
      updateStatus,
      flagCheck
    ],
    teletickOnTrack: [ // run each telemetry tick while on track
      updateTimer, // Updates the lap-timer
      updateLapsOnRemainingFuel, // Calculates how many laps we can run on the remaining fuel
      updateIncidents, // updates the incident-counter
      updateHybrid, // Enables the hybrid-card and updates the data
      measurePitTime,
      updateFuel
    ],
    teletickNotOnTrack: [
      resetPitTimer
    ],
    newlap: [ // run when a new lap is triggered
      pushNewLap // Push a new lap-row to the timing-table
    ],
    newlaptiming:[ // new lap has begun, and last laptime has arrived
      calcTotalRaceLength, // Updates the race length calculator
      updateLastLap, // Updates the last lap-time with the accurate value from the sim
      updateMedianLapTime, // Gets median laptime thus far in the race
      updateRemainingLaps, // Estimates the remaining laps based on median lap time
      updateAverageFuelConsumption, // Calculates average fuelconsumption based on last three laps
      updateFuelToFinish, // Calculates remainder/needed fuel to finish
      checkLapFastestLaptime // Updates the color-coding of the row with the fastest lap
    ],
    newsession:[ // run when a new session is triggered
      updateFuel, // added first, because it gets run last by eventemitter
      updateKGltr, // Update globals to match our selected KG/Ltr setting in the UI
      newSession // this must run first
    ],
    checkeredFlag:[
      raceFinishing // Race is about to finish
    ],
    disqualifyFlag:[
      raceOver
    ]
  })
}
function HandlersInit() {
  document.getElementById('selectTotalRaceLength').onchange = calcTotalRaceLength
  document.getElementsByName('KGltrRadio')[0].onchange = updateKGltr
}

var ready = (f)=>(document.readyState === 'complete')?f():document.addEventListener('DOMContentLoaded',f,false)

ready(()=>{
  SSEinit()
  EventInit()
  HandlersInit() 
})