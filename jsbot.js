var Bot    = require('ttapi');
var config = require('./jsbot.conf.js');
var db     = require('mongoose');

//var AUTH =  'auth+live+d854aef13150cc9dbc4c903bc5f5f05dd6a9dafd';
//var USERID = '4ed9bb62a3f75122f60005ff';
//var ROOMID = '4e35aff714169c607f5813dc';
var AUTH   = 'auth+live+ded3591fd7e3a27f5eccabfb42f384538d62dc6a';
var USERID = '4ecc10154fe7d03a6f0003d9';
var ROOMID = '4e35aff714169c607f5813dc';

var bot = new Bot(AUTH, USERID, ROOMID);
bot.tcpListen(2345, '127.0.0.1');

setTimeout(function() { bot.modifyLaptop('chrome'); }, 2500);

//bot.debug = true;

var mods = [];
var djannounce = false;
var lastbs = new Date(0);
var lastrules = new Date(0);
var lastdjannouce = new Date(0);
var voteup = false;
var saystats = true;
var hatephil = false;

var dance = true;

var users = {}

var cs = {
  artist: null,
  song: null,
  djname: null,
  djid: null,
  up: 0,
  down: 0,
  listeners: 0,
  started: 0,
  mods: [],
  snags: 0
};



var myScriptVersion = 'V0.0.1';
var ops= ['4e81f2084fe7d052f551f1cb'];

// My TCP Functions
bot.on('tcpMessage', function (socket, msg) {
  if (msg == 'version') {
    socket.write('>> '+myScriptVersion+'\n');
  } else if (msg == 'bop') {
    bot.vote('up');
  } else if (msg == 'lame') {
    bot.vote('down');
  } else if (msg == 'troll') {
    bot.speak('Please don\'t feed the troll.');
  } else if (msg.match(/^say (.*)$/)) {
    var com = msg.match(/^say (.*)$/)[1];
    bot.speak(com);
  } else if (msg.match(/^avatar (.*)$/)) {
    var av = msg.match(/^avatar (.*)$/)[1];
    bot.setAvatar(av);
  } else if (msg.match(/^snag$/)) {
    bot.roomInfo(true, function(data) {
      var newSong = data.room.metadata.current_song._id;
      bot.playlistAdd(newSong);
    });
  }

});

bot.on('newsong', function(data) {
  meta = data.room.metadata;
  var dj = meta.current_dj;
  cs.artist = meta.current_song.metadata.artist;
  cs.song = meta.current_song.metadata.song;
  cs.djname = meta.current_song.djname;
  cs.djid = meta.current_song.djid;
  cs.up = meta.upvotes;
  cs.down = meta.downvotes;
  cs.listeners = meta.listeners;
  cs.started = meta.current_song.starttime;
  cs.mods = meta.moderator_id;
  cs.mods.push(meta.userid);
  cs.snags = 0;
//  if (dj == '4e0cd7bba3f751466f14a2ad') {
//    bot.vote('down');
//  }
//  if (isop(dj) || ismod(dj)) {
//    bot.vote('up');
//  }
  mods = meta.moderator_id;
  mods.push(meta.userid);
  voteup = false;
  console.log('Newsong: DJ: ' + cs.djname + '; ' + cs.song + ' by ' + cs.artist);
});

bot.on('roomChanged', function(data) {
    meta = data.room.metadata;
    var dj = meta.current_dj;
    cs.artist = meta.current_song.metadata.artist;
    cs.song = meta.current_song.metadata.song;
    cs.djname = meta.current_song.djname;
    cs.djid = meta.current_song.djid;
    cs.up = meta.upvotes;
    cs.down = meta.downvotes;
    cs.listeners = meta.listeners;
    cs.started = meta.current_song.starttime;
    cs.mods = meta.moderator_id;
    cs.mods.push(meta.userid);
    cs.snags = 0;
});

bot.on('update_votes', function (data) {
  cs.up = data.room.metadata.upvotes;
  cs.down = data.room.metadata.downvotes;
  cs.listeners = data.room.metadata.listeners;
});

bot.on('snagged', function(data) {
  cs.snags = cs.snags + 1;
});

bot.on('endsong', function (data) {
  if (saystats==true) {
    bot.speak(cs.song + ' stats: up: ' + cs.up + ' down: ' + cs.down +
      ' snag: ' + cs.snags);
  }
});

bot.on('add_dj', function (data) {
  if (djannounce) {
    bot.speak('Hi ' + data.user[0].name + ' ' + djannounce);
  }
});

// Our in room commands
bot.on('speak', function (data) {
  // Get the data
  var name = data.name;
  var text = data.text;

  console.log('chat: ' + name + ': ' + text);
  // Respond to "botsnack" command
  if (text.match(/^\.j botsnack$/)) {
    var l_d = new Date() - lastbs;
    if (l_d < (2* 60 * 1000)) { return; }
    lastbs = new Date();
    bot.speak('Thanks for the botsnack '+name);
    if (hatephil == true && cs.djid == '4e0cd7bba3f751466f14a2ad') { return; }
    if (dance == false) { return; }
    bot.vote('up');
  } else if (text.match(/^\/dance$/)) {
    if (hatephil == true && cs.djid == '4e0cd7bba3f751466f14a2ad') { return; }
    if (dance == false) { return; }
    if (!voteup) {
      bot.vote('up');
    }
    voteup = true;
  } else if (text.match(/^\.j likephil$/) && isop(data.userid)) {
    hatephil = false;
    bot.speak('Ok, I guess I like him now');
  } else if (text.match(/^\.j hatephil$/) && isop(data.userid)) {
    hatephil = true;
    bot.speak(':spit: These botsnacks are POISON!');
  } else if (text.match(/^\.j quit$/)) { 
    if (isop(data.userid)) {
      bot.speak('So long and thanks for all the fish.  '+name+' ordered me to die.');
      process.exit()
    }
  } else if (text.match(/^\.j sstoggle$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      saystats = !saystats;
      bot.speak('Saystats set to: ' + saystats);
    }
  } else if (text.match(/^.j dance$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      dance = !dance;
      bot.speak('Dance set to: ' + dance);
    }
  } else if (text.match(/^\.j djup$/)) {
    if (isop(data.userid)) {
      bot.speak('Yay!  I like to DJ!');
      bot.addDj();
    }
  } else if (text.match(/^\.j djdown$/)) {
    if (isop(data.userid)) {
      bot.speak('Aww.  Down I go.');
      bot.remDj();
    }
  } else if (text.match(/^\.j djqueue$/)) {
    if (isop(data.userid)) {
      bot.roomInfo(true, function(data) {
        var newSong = data.room.metadata.current_song._id;
        var newSongName = data.room.metadata.current_song.metadata.song;
        bot.playlistAdd(newSong);
        bot.speak('Added ' + newSongName + ' to my queue');
      });
    }
  } else if (text.match(/^\.j djskip$/)) {
    if (isop(data.userid)) {
      bot.speak('Sorry you dont like my song.');
      bot.stopSong();
    }
  } else if (text.match(/^\/q/)) {
    bot.speak('No queues in here, fastest fingers when a DJ decides to step down');
  } else if (text.match(/^\.j djannounce (.*)$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      var com = text.match(/^\.j djannounce (.*)$/)[1];
      if (com.split(/\s+/)[0] == 'off') {
        bot.speak('DJ Announce turned off');
        djannounce = false;
      } else {
        bot.speak('DJ Announce set to: ' + com);
        djannounce = com;
      }
    }
  } else if (text.match(/^\.j? ?rules$/)) {
    var l_d = new Date() - lastrules;
    if (l_d < (2* 60 * 1000)) { return; }
    lastrules = new Date();

    bot.speak('Room Rules: 1) No AFK DJ >15min or 9Min three times in two hours.  2) 88-01 Alternative with a 90s sound.');
    setTimeout(function() {
      bot.speak('3) DJs must be available, and must support (awesome) every song. 4) All Weezer and Foo Fighters allowed');
    }, 250);
    setTimeout(function() {
      bot.speak('5) No Spam, Creed or Rap/Hip Hop (Except Beastie Boys) See http://on.fb.me/tRcZZu for more info');
    }, 500);
  }
});

function isop (userid) {
  for (var i = 0; i < ops.length; i++) {
    if (userid == ops[i]) {
      return true;
    }
  }
  return false;
}

function ismod (userid) {
  var ismod=false;
  for (var m=0; m<mods.length; m++) {
    if (mods[m] == userid) {
      ismod=true;
    }
  }
  return ismod;
}

