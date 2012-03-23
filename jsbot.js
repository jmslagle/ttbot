var Bot    = require('ttapi');
var config = require('./jsbot.conf.js');
var db     = require('./db.js');

var Artist = db.Artist;
var Song = db.Song;
var User = db.User;
var Play = db.Play;

var bot = new Bot(config.AUTH, config.USERID, config.ROOMID);
bot.tcpListen(config.telport, '127.0.0.1');
bot.listen(config.webport,'0.0.0.0');

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
var dance = config.dance;
var doidle = config.doidle;
var amdj = false;
var idleenforce = config.idleenforce;
var wantdj=false;

var users = {}

var cs = {
  artist: null,
  album: null,
  song: null,
  songid: null,
  djname: null,
  djid: null,
  up: 0,
  down: 0,
  listeners: 0,
  started: 0,
  mods: [],
  snags: 0
};

var botVersion = 'JSBot 2012031501';

// My TCP Functions
bot.on('tcpMessage', function (socket, msg) {
  var s = {
    type: 'S',
    name: 'TCP User',
    userid: 0,
    socket: socket
  };

  msg=msg.trim().replace(/\r\n/,'');
  console.log('Socket: ' + msg);

  res=msg.match(/^(\w+)( .*)?$/);
  var com=res[1].trim().toLowerCase();
  var args='';
  if (res.length == 3 && res[2]) {
    args=res[2].trim();
  }
  doCommand(com,args,s);

});

bot.on('httpRequest', function (req,res) {
  var method = req.method;
  var url = req.url;
  switch (url) {
    case '/users/':
      if (method=='GET') {
        res.writeHead(200, { 'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'http://www.tacorp.net' });
        res.end(JSON.stringify(users));
      } else {
        res.writeHead(500);
        res.end();
      }
      break;
    case '/cs/':
      if (method=='GET') {
        res.writeHead(200, { 'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'http://www.tacorp.net' });
        res.end(JSON.stringify(cs));
      } else {
        res.writeHead(500);
        res.end();
      }
      break;
    default:
      res.writeHead(404);
      res.end("Page not found");
      break;
  }
});

bot.on('newsong', function(data) {

  newSong(data);

  if (amdj) {
    setTimeout(function() { bot.vote('up'); },
        2750 + (Math.floor(Math.random()*16)*1000));
  }

  voteup = false;
  console.log('Newsong: DJ: ' + cs.djname + '; ' + cs.song + ' by ' + cs.artist);
});

bot.on('roomChanged', function(data) {
  meta = data.room.metadata;

  newSong(data);

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

  var now = new Date();
  var vl = data.room.metadata.votelog;
  for (var u=0; u<vl.length; u++) {
    updateActivity(vl[u][0]);
    if (users.hasOwnProperty(vl[u][0])) {
      console.log(now + " VoteUp: " + users[vl[u][0]].name);
    }
  }

});

bot.on('snagged', function(data) {
  cs.snags = cs.snags + 1;
  updateActivity(data.userid);
});

bot.on('endsong', function (data) {

  endSong();

  if (saystats==true) {
    bot.speak(cs.song + ' stats: up: ' + cs.up + ' down: ' + cs.down +
      ' snag: ' + cs.snags);
  }
  enforceRoom();
});

bot.on('add_dj', function (data) {
  if (data.user[0].userid == config.USERID) {
    amdj = true;
    wantdj = false;
  }
  users[data.user[0].userid].isDj = true;
  if (djannounce) {
    bot.speak('Hi ' + data.user[0].name + ' ' + djannounce);
  }
  djs = djs + 1;
  console.log("DJUP: " + data.user[0].name);
});

bot.on('rem_dj', function (data) {
  if (data.user[0].userid == config.USERID) {
    amdj = false;
  }
  if (wantdj == true) {
    bot.addDj();
  }
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
  var s = {
    type: 'C',
    name: data.name,
    userid: data.userid
  };

  var text = data.text;
  var now = new Date();

  updateActivity(data.userid);

  console.log(now + ' chat: ' + name + ': ' + text);

  // Main command loop
  if (res=text.match(/^.j (\w+)( .*)?$/)) {
    var com=res[1].trim().toLowerCase();
    var args='';
    if (res.length == 3 && res[2]) {
      args=res[2].trim();
    }
    doCommand(com,args,s);
  }

  if (text.match(/^\/dance$/)) {
    doDance(s);
  } else if (text.match(/^\/q/)) {
    bot.speak('No queues in here, fastest fingers when a DJ decides to step down');
  } else if (text.match(/^\.rules$/)) {
    doCommand('rules','',s);
  }
});

bot.on('pmmed', function (data) {
  // Get the dddata
  var text = data.text;

  var uid = data.senderid;
  name = 'User';
  if (users.hasOwnProperty(uid)) {
    name = users[uid].name;
  } else {
    Users.findById(uid, function(err, doc) {
      log(err);
      if (doc) {
        name=doc.name;
      } else {
        bot.getProfile(uid,function(data) {
          name=data.name;
        });
      }
    });
  }
  var s = {
    type: 'P',
    name: name,
    userid: uid
  };
  var now = new Date();

  updateActivity(uid);

  console.log(now + ' pm: ' + name + ': ' + text);

  // Main command loop
  if (res=text.match(/^.j (\w+)( .*)?$/)) {
    var com=res[1].trim().toLowerCase();
    var args='';
    if (res.length == 3 && res[2]) {
      args=res[2].trim();
    }
    doCommand(com,args,s);
  }

  if (text.match(/^\.rules$/)) {
    doCommand('rules','',s);
  }
});

function doCommand(command, args, source) {

  switch(command) {
    case 'record':
      doRecord(source);
      return;
    case 'botsnack':
      if (source.type != 'C') return; // Only do botsnacks in public
      var l_d = new Date() - lastbs;
      if (l_d < (2* 60 * 1000)) { return; }
      lastbs = new Date();
      emote(source,'Thanks for the botsnack ' + source.name);
      doDance(source);
      return;
    case 'version':
      emote(source,'JSBot by jslagle - version ' + botVersion + ' https://github.com/jmslagle/ttbot');
      return;
    case 'recordartist':
      doRecordArtist(source);
      return;
    case 'myrecord':
      doUserRecord(source);
      return;
    case 'mystats':
      doUserStats(source);
      return;
    case 'seen':
      doSeen(source, args);
      return;
    case 'rules':
      if (source.type == 'C') {
        var l_d = new Date() - lastrules;
        if (l_d < (2* 60 * 1000)) { return; }
        lastrules = new Date();
      }

      emote(source,'Room Rules: 1) No AFK DJ >15min or 9Min three times in two hours.  2) 88-01 Alternative with a 90s sound.');
      setTimeout(function() {
        emote(source,'3) DJs must be available, and must support (awesome) every song. 4) All Weezer and Foo Fighters allowed');
      }, 250);
      setTimeout(function() {
        emote(source,'5) No Spam, Creed or Rap/Hip Hop (Except Beastie Boys) See http://on.fb.me/tRcZZu for more info');
      }, 500);
      return;
  }

  // Mod level commands
  if (isop(source.userid) || ismod(source.userid) || source.type == 'S') {
    switch(command) {
      case 'sstoggle':
        saystats = !saystats;
        emote(source,'Saystats set to: ' + saystats);
        return;
      case 'dance':
        dance = !dance;
        emote(source,'Dance set to: ' + dance);
        return;
      case 'idlewarn':
        doidle = !doidle;
        emote(source,'Idle announcements set to: ' + doidle);
        return;
      case 'idleenforce':
        idleenforce = !idleenforce;
        emote(source,'Idle Enforcement set to: ' + idleenforce);
        return;
      case 'idlesettings':
        emote(source,"Idle Warn: " + config.idlewarn + " Idle Limit: "
          + config.idlelimit + " Idle Reset: " + config.idlereset
          + " Idle Kick: " + config.idlekick + " Min DJS: " + config.mindjs);
        return;
      case 'djs':
        var now = new Date();
        for(var u in users) {
          if (users[u].isDj == true) {
            emote(source,users[u].name + ' - Id: ' +
                (Math.round((now - users[u].lastActive)/1000)) + ' Wa: '
                + users[u].warns.length + '');
          }
        }
        return;
      case 'djup':
        bot.speak('Yay!  I like to DJ!');
        bot.addDj();
        wantdj=true;
        return;
      case 'djdown':
        bot.speak('Aww.  Down I go.');
        bot.remDj();
        return;
      case 'djqueue':
        bot.roomInfo(true, function(data) {
          var newSong = data.room.metadata.current_song._id;
          var newSongName = data.room.metadata.current_song.metadata.song;
          bot.playlistAdd(newSong);
          emote(source,'Added ' + newSongName + ' to my queue');
        });
        return;
      case 'djskip':
        emote(source,'Sorry you dont like my song.');
        bot.stopSong();
        return;
      case 'djshuffle':
        emote(source,'Shuffling my playlist');
        playlistRandom();
        return;
      case 'djannounce':
        if (args.split(/\s+/)[0] == 'off') {
          emote(source,'DJ Announce turned off');
          djannounce = false;
        } else {
          emote(source,'DJ Announce set to: ' + args);
          djannounce = args;
        }
        return;
    }
  }

  // Op level commands
  if (isop(source.userid) || source.type == 'S') {
    switch(command) {
      case 'quit':
        bot.speak('So long and thanks for all the fish.');
        process.exit();
        return;
      case 'kick':
        user=args.split(/\s+/)[0];
        reason=args.slice(user.length).trim();
        u=findUser(user);
        if (u) {
          bot.bootUser(u.userid,reason);
        }
        return;
      case 'lame':
        bot.vote('down');
        voteup=true;
        return;
      case 'enforce':
        enforceRoom();
        return;
      case 'avatar':
        bot.setAvatar(args);
        return;
      case 'say':
        bot.speak(args);
        return;
      case 'warn':
        u=findUser(args);
        if (u) {
          bot.speak('@' + args + ' - You have been officially warned. ' +
              ' Please read the room rules');
          u.warns.push(new Date());
        }
      case 'setwarn':
        t=args.lastIndexOf(/\s+/);
        user=args.slice(0,t).trim();
        warn=args.slice(t).trim();
        u=findUser(user);
        if (u) {
          u.warns = [];
          for (var x=0; x<warn; x++) {
            u.warns.push(new Date());
          }
          emote(source,'Setting warn on ' + user + ' to ' + warn);
        }
        return;
      case 'yank':
        u=findUser(args);
        if (u) {
          bot.remDj(u.userid);
        }
        break;
      case 'mod':
        u=findUser(args);
        if (u) {
          bot.addModerator(u.userid);
        }
        break;
      case 'demod':
        u.findUser(args);
        if (u) {
          bot.remModerator(u.userid);
        }
        break;
    }
  }
}

function doSeen(source, args) {
  name=args.toLowerCase();
  u=findUser(name);
  if (u!=null) {
    emote(source, args + ' is here right now!  Last Active: ' +
        u.lastActive);
    return;
  } else {
    User.findOne({ lowername: name }, ['lastSeen','lastActive','_id'],
        function(err,docs) {
          if (docs) {
            u=docs;
            emote(source, 'I last saw ' + args + ': ' +
              docs.lastSeen.toLocaleString() + ' and they were last active: ' +
              docs.lastActive.toLocaleString());
          } else {
            emote(source, 'I have no record of ' + args);
          }
        });
  }
}

function doUserStats(source) {
  if (source.type=='S') {
    emote(source,'I don\'t know your userid');
    return;
  }
  u=User.findById(source.userid, function(err,doc) {
    if (doc) {
      emote(source,source.name + ' - You have ' + doc.plays + ' plays ' +
        ' totaling ' + doc.ups + ' ups, ' + doc.downs + ' downs, and ' +
        doc.snags + ' snags.');
    } else {
      emote(source, 'I don\'t know you ' + source.name);
    }
  });
}

function doUserRecord(source) {
  if (source.type=='S') {
    emote(source,'I don\'t know your userid');
    return;
  }
  Play.where('dj',source.userid).sort('score',-1, 'played',1)
    .limit(1).select('_id').run(function(err,doc) {
      log(err);
      if (doc) {
        p=doc[0];
        if (!p) {
          emote(source,source.name + ' - I have no record of you');
          return;
        }
        Play.getPlay(p._id, function(err,doc) {
          log(err);
          p=doc;
          Song.getSong(p.song._id, function(err,doc) {
            log(err);
            s=doc;
            emote(source,p.dj.name + ' - your record play: '
              + p.song.name + ' by ' + s.artist.name
              + ' with a combined score of ' + p.score);
          });
        });
      } else {
        emote(source,source + ' - I have no record of you');
      }
    });
}


function doRecordArtist(source) {
  Artist.where('ups').gt(0).sort('ups',-1,'downs',1).limit(1)
    .run(function(err,doc) {
      log(err);
      a=doc[0];
      emote(source, 'Record Artist: ' + a.name + ' with ' + a.ups +
        ' up votes, ' + a.downs + ' down votes, ' + a.snags + ' snags ' +
        ' and ' + a.plays + ' plays');
    });
  return;

}

function doDance(source) {
  if (!isop(source.userid) && !ismod(source.userid) && dance == false) {
    return;
  }
  if (!voteup) {
  setTimeout(function() {
    bot.vote('up'); },
    2750 + (Math.floor(Math.random()*12)*1000)
    );
  }
  voteup=true;
}

function doRecord(source) {
  Play.where('score').gt(0).sort('score',-1, 'played',1)
    .limit(1).select('_id').run(function(err,doc) {
      log(err);
      p=doc[0];
      Play.getPlay(p._id, function(err,doc) {
        log(err);
        p=doc;
        Song.getSong(p.song._id, function(err,doc) {
          log(err);
          s=doc;
          emote(source,'Record Play: ' + p.dj.name + ' played '
            + p.song.name + ' by ' + s.artist.name
            + ' with a combined score of ' + p.score);
        });
      });
    });
}

function emote(source, msg) {
  switch(source.type) {
    case 'C':
      bot.speak(msg);
      break;
    case 'P':
      bot.pm(msg, source.userid);
      break;
    case 'S':
      source.socket.write('>> ' + msg + '\n');
      break;
  }
}

function newSong(data) {
    meta = data.room.metadata;
    var dj = meta.current_dj;
    cs.artist = meta.current_song.metadata.artist;
    cs.album = meta.current_song.metadata.album;
    cs.song = meta.current_song.metadata.song;
    cs.djname = meta.current_song.djname;
    cs.songid = meta.current_song._id;
    cs.djid = meta.current_song.djid;
    cs.up = meta.upvotes;
    cs.down = meta.downvotes;
    cs.listeners = meta.listeners;
    cs.started = meta.current_song.starttime;
    cs.mods = meta.moderator_id;
    cs.mods.push(meta.userid);
    cs.snags = 0;
    mods = cs.mods;
}

function endSong() {
  var up=cs.up;
  var down=cs.down;
  var snag=cs.snags;
  var song=cs.song;
  var listeners=cs.listeners;
  var songid=cs.songid;
  var artist=cs.artist;
  var artistid=null;
  var djid=cs.djid;
  var djname=cs.djname;
  var album=cs.album;
  Artist.foc(artist, function(err, docs) {
    log(err);
    a = docs;
    Song.foc(songid, song, a, function(err, docs) {
      log(err);
      s = docs;
      User.foc(djid, djname, function(err,docs) {
        log(err);
        u=docs;
        var thisplay=null;
        Play.foc(null, function(err, docs) {
          log(err);
          p = docs;
          p.dj = djid;
          p.listeners = listeners;
          p.ups = up;
          p.downs = down;
          p.snags = snag;
          p.song = s;
          p.score = up - down;
          thisplay = p;
          p.save(function(err) {
            log(err);
          });
        });
        u.ups = u.ups ? u.ups + up : up;
        u.downs = u.downs ? u.downs + down : down;
        u.snags = us.snags ? u.snags + snag : snag;
        u.plays++;
        var score = up - down;
        if (score > u.record) {
          u.record = score;
          u.recordplay = thisplay;
        }
        u.save(function(err) {
          log(err)
        });
      });

      s.ups = s.ups ? s.ups + up : up;
      s.downs = s.downs ? s.downs + down : down;
      s.snags = s.snags ? s.snags + snag : snag;
      s.album = album;
      s.plays++;
      s.save(function(err) {
        log(err);
      });
    });
    a.ups = a.ups ? a.ups + up : up;
    a.downs = a.downs ? a.downs + down : down;
    a.snags = a.snags ? a.snags + snag : snag;
    a.plays++;
    a.save(function(err) {
      log(err);
    });
    artistid = a._id;
  });
  var now = new Date();
  for (var u in users) {
    User.foc(users[u].userid, users[u].name, function(err, data) {
      log(err);
      us=data;
      uid=us._id;
      if (users.hasOwnProperty(uid)) {
        us.lastActive=users[uid].lastActive;
        us.lowername=users[uid].name.toLowerCase();
        us.lastSeen=now;
        if (users[uid].isDj==true) {
          us.lastDj=now;
        }
      }
      us.save(function(err) {
        log(err);
      });
    });
  }
}


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
      if (idleenforce == true) {
        console.log("Idle Kick: " + users[u].name);
        bot.remDj(users[u].userid);
        bot.speak("Removing " + users[u].name + " for inactivity");
      }
      continue;
    }
    if (users[u].warns.length >= config.idlelimit) {
      console.log("Idle Limit: " + users[u].name);
      if (doidle == true) {
        bot.speak("Sorry " + "@" + users[u].name + " you're idle more than " +
            config.idlelimit + " times in " + config.idlereset/60 + " hour(s). " +
            " Feel free to hop back up when you return.");
      }
      if (idleenforce == true) {
        bot.remDj(users[u].userid);
        users[u].warns = [];
      }
    }
  }
}


function checkIdle() {
  var now = new Date();
  for(var u in users) {
    // First age out any old ones
    for (var i=0;i<users[u].warns.length;i++) {
      if (now - users[u].warns[i] > (config.idlereset * 60000)) {
        users[u].warns.splice(i,1);
      }
    }
    if (users[u].isDj == true) {
      if (now - users[u].lastActive > (config.idlewarn * 60000)) {
        // Don't due stuff if it's too soon
        if (users[u].warns.length > 0 &&
            (now - users[u].warns[users[u].warns.length-1]) <
            (config.idlewarn * 60000)) { continue; }
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
            bot.speak("@" + users[u].name + " - " + warn +
                " warning - idle > " + config.idlewarn + " mins " +
               "in " + config.idlereset/60 + " hours.  Please be active "+
               config.idlewarn + "x" + config.idlelimit);
          }
        }
      }
    }
  }
}

function playlistRandom() {
  var plLength=0;
  bot.playlistAll(function(resp) {
    plLength=resp.list.length;
  });
  for (var i=0; i<plLength; i++) {
    newPos=Math.floor(Math.random()*(plLength+1));
    bot.playlistReorder(i, newPos);
  }
}

function findUser(name) {
  a=name.toLowerCase();
  for(var u in users) {
    if (users[u].name.toLowerCase()==a) {
      return users[u];
    }
  }
  return null;
}


function log(data) {
  if (data) {
    console.log("ERR: " + data);
  }
}


setInterval(checkIdle, 10000);


