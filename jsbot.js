var Bot    = require('ttapi');
var config = require('./jsbot.conf.js');
var db     = require('mongoose');

var bot = new Bot(config.AUTH, config.USERID, config.ROOMID);
bot.tcpListen(config.telport, '127.0.0.1');

setTimeout(function() { bot.modifyLaptop('chrome'); }, 2500);

//bot.debug = true;

var mods = [];
var djannounce = false;
var lastbs = new Date(0);
var lastrules = new Date(0);
var lastdjannouce = new Date(0);
var voteup = false;
var djs = 0;

var saystats = config.saystats;
var hatephil = config.hatephil;
var dance = config.dance;
var doidle = config.doidle;
var idleenforce = config.idleenforce;

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

var myScriptVersion = 'JSBot 2012010201';

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
  } else if (msg.match(/^users$/)) {
    var now = new Date();
    for(var u in users) {
      socket.write(users[u].name + ' Idle: ' + 
          ((now - users[u].lastActive)/1000) + ' Dj: '
          + users[u].isDj + '\n');
    }
  } else if (msg.match(/^idle$/)) {
    checkIdle();
  } else if (msg.match(/^enforce$/)) {
    enforceRoom();
  } else if (msg.match(/^djs$/)) {
    var now = new Date();
    for(var u in users) {
      if (users[u].isDj == true) {
        socket.write(users[u].name + ' Idle: ' + 
            ((now - users[u].lastActive)/1000) + ' Dj: '
           + users[u].isDj + '\n');
      }
    }
  }
});

bot.on('newsong', function(data) {
  meta = data.room.metadata;
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
//  if (cs.djid == '4e0cd7bba3f751466f14a2ad') {
//    bot.vote('down');
//  }
//  if (isop(cs.djid) || ismod(cs.djid)) {
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
    mods = cs.mods;

    // Repopulate user list
    users = {}
    for (var u=0; u<data.users.length; u++) {
      us = data.users[u];
      us.lastActive = new Date();
      us.isDj = false;
      us.warns = [];
      users[us.userid] = us;
      console.log('User: ' + us.name);
    }
    for (var d=0; d<meta.djs.length; d++) {
      users[meta.djs[d]].isDj = true;
    }
    djs = meta.djs.length;
});

bot.on('update_votes', function (data) {
  cs.up = data.room.metadata.upvotes;
  cs.down = data.room.metadata.downvotes;
  cs.listeners = data.room.metadata.listeners;

  var vl = data.room.metadata.votelog;
  for (var u=0; u<vl.length; u++) {
    updateActivity(vl[u][0]);
  }

});

bot.on('snagged', function(data) {
  cs.snags = cs.snags + 1;
  updateActivity(data.userid);
});

bot.on('endsong', function (data) {
  if (saystats==true) {
    bot.speak(cs.song + ' stats: up: ' + cs.up + ' down: ' + cs.down +
      ' snag: ' + cs.snags);
  }
  enforceRoom();
});

bot.on('add_dj', function (data) {
  users[data.user[0].userid].isDj = true;
  if (djannounce) {
    bot.speak('Hi ' + data.user[0].name + ' ' + djannounce);
  }
  djs = djs + 1;
  console.log("DJUP: " + data.user[0].name);
});

bot.on('rem_dj', function (data) {
  users[data.user[0].userid].isDj = false;
  djs = djs - 1;
  console.log("DJDOWN: " + data.user[0].name);
});

bot.on('registered', function (data) {
  var us=data.user[0];
  us.isDj = false;
  us.warns = [];
  us.lastActive = new Date();
  users[us.userid] = us;
  console.log("Join: " + us.name);
});

bot.on('deregistered', function (data) {
  delete users[data.user[0].userid];
  console.log("Part: " + data.user[0].name);
});

// Our in room commands
bot.on('speak', function (data) {
  // Get the data
  var name = data.name;
  var text = data.text;

  updateActivity(data.userid);

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
  } else if (text.match(/^\.j dance$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      dance = !dance;
      bot.speak('Dance set to: ' + dance);
    }
  } else if (text.match(/^\.j doidle$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      doidle = !doidle;
      bot.speak('Idle announcements set to: ' + doidle);
    }
  } else if (text.match(/^\.j idleenforce$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      idleenforce = !idleenforce;
      bot.speak('Idle Enforcement set to: ' + idleenforce);
    }
  } else if (text.match(/^\.j idleset$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      bot.speak("Idle Warn: " + config.idlewarn + " Idle Limit: " 
          + config.idlelimit + " Idle Reset: " + config.idlereset
          + " Idle Kick: " + config.idlekick + " Min DJS: " + config.mindjs);
    } 
  } else if (text.match(/^\.j djs$/)) {
    if (isop(data.userid) || ismod(data.userid)) {
      var now = new Date();
      for(var u in users) {
        if (users[u].isDj == true) {
          bot.speak(users[u].name + ' - Id: ' + 
              (Math.round((now - users[u].lastActive)/1000)) + ' Wa: '
              + users[u].warns.length + '');
        }
      }
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
  for (var i = 0; i < config.ops.length; i++) {
    if (userid == config.ops[i]) {
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

function updateActivity(userid) {
  if (userid && users.hasOwnProperty(userid)) {
    users[userid].lastActive = new Date();
  }
}

function enforceRoom() {
  var now = new Date();
  if (djs < config.mindjs) { return; }
  for (var u in users) {
    if (users[u].isDj == false) { continue; }
    // Do the idle check so we can just compare
    checkIdle();
    if (now - users[u].lastActive > (config.idlekick * 60000)) {
      console.log("Idle Kick: " + users[u].name);
      if (doidle == true) {
        bot.speak("Sorry " + users[u].name + " you're idle more than " +
            config.idlekick + " minutes.  Feel free to hop back up when " +
            "you return.");
      }
      if (idleenforce == true) {
        bot.remDj(user[u].userid);
      }
      continue;
    }
    if (users[u].warns.length >= config.idlelimit) {
      console.log("Idle Limit: " + users[u].name);
      if (doidle == true) {
        bot.speak("Sorry " + users[u].name + " you're idle more than " +
            config.idlelimit + " times in " + config.idlereset + " hour(s). " +
            " Feel free to hop back up when you return.");
      }
      if (idleenforce == true) {
        bot.remDj(user[u].userid);
      }
    }
  }
}


function checkIdle() {
  var now = new Date();
  for(var u in users) {
    if (users[u].isDj == true) {
      if (now - users[u].lastActive > (config.idlewarn * 60000)) {
        // Don't due stuff if it's too soon
        if (users[u].warns.length > 0 &&
            (now - users[u].warns[users[u].warns.length-1]) <
            (config.idlewarn * 60000)) { continue; }
        // First age out any old ones
        for (var i=0;i<users[u].warns.length;i++) {
          if (now - users[u].warns[i] > (config.idlereset * 60000)) {
            users[u].warns.slice(i);
          }
        }
        // Add new warning
        users[u].warns.push(now);
        if (djs > config.mindjs &&
            users[u].warns.length < (config.idlelimit+1)) {
          switch(users[u].warns.length) {
            case 1:
              var warn = "First";
              break;
            case 2:
              var warn = "Second";
              break;
            case 3:
              var warn = "Third";
              break;
            default:
              var warn = users[u].warns.length + "th"; 
              break;
          }
          if (doidle == true) {
            bot.speak(users[u].name + " - " + warn + 
                " warning - idle > " + config.idlewarn + " mins " +
               "in " + config.idlereset/60 + " hours.  Please be active "+
               config.idlewarn + "x" + config.idlelimit);
          }
        }
      }
    }
  }
}

setInterval(checkIdle, 10000);


