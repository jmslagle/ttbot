var Bot    = require('ttapi');
var conf   = require('./jsbot.conf.js');
var db     = require('./db.js');
var repl   = require('repl');

var Artist = db.Artist;
var Song = db.Song;
var User = db.User;
var Play = db.Play;
var DBConfig = db.DBConfig;

var bot = new Bot(conf.AUTH, conf.USERID, conf.ROOMID);
bot.tcpListen(conf.telport, '127.0.0.1');
bot.listen(conf.webport,'0.0.0.0');

setTimeout(function() { bot.modifyLaptop('chrome'); }, 2500);

//bot.debug = true;

var mods = [];
var djannounce = false;
var lastbs = new Date(0);
var lastrules = new Date(0);
var lastdjannouce = new Date(0);
var voteup = false;
var djs = 0;

var interactive = false;
var saystats = conf.saystats;
var dance = conf.dance;
var doidle = conf.doidle;
var ignore = conf.ignore;
var amdj = false;
var idleenforce = conf.idleenforce;
var wantdj=false;
var forcedj=false;
var users = {};
var banneddj = [];
var banned = [];

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

var botVersion = 'JSBot 2012070501';

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
  var aurl = require('url').parse(req.url,true)
  var url = aurl.pathname;
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
    case '/playlist':
      if (method=='GET') {
        res.write("<HTML><HEAD><TITLE>Playlist</TITLE></HEAD>");
        res.write("<TABLE>");
        bot.playlistAll(function(resp) {
          l=resp.list;
          for (i=0; i<resp.list.length; i++) {
            res.write("<TR>");
            res.write("<TD><A HREF=/pld?id=" + l[i]._id + ">" + l[i]._id + "</A></TD>");
            res.write("<TD>" + l[i].metadata.artist + "</TD>");
            res.write("<TD>" + l[i].metadata.album + "</TD>");
            res.write("<TD>" + l[i].metadata.song + "</TD>");
            res.write("</TR>");
          }
          res.end("</TABLE></HTML>");
        });
      } else {
        res.writeHead(500);
        res.end();
      }
      break;
    case '/pld':
      if (method=='GET') {
        delid=aurl.query.id;
        if (delid) {
          bot.playlistAll(function(resp) {
            for (var i=0; i<resp.list.length; i++) {
              if (resp.list[i]._id == delid) {
                bot.playlistRemove(i);
              }
            }
          });
        }
        res.writeHead(302, { 'Location': '/playlist' });
        res.end();
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
    if (djs==5 && forcedj==false) {
      bot.remDj();
      bot.speak('Room at 5 DJs - hopping down');
      amdj=false;
    }
    setTimeout(function() { bot.vote('up'); },
        2750 + (Math.floor(Math.random()*16)*1000));
  } else {
    if (djs<3 && forcedj==false) {
      bot.addDj();
      amdj=true;
      bot.speak('Less than 3 DJs - time to rock!');
      bot.vote('up');
    }
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
    checkBan(data.users[u].userid);
    us = data.users[u];
    us.lastActive = new Date();
    us.isDj = false;
    us.warns = [];
    users[us.userid] = us;
    console.log('User: ' + us.name);
    if (isDemod(us.userid)) {
      if (ismod(us.userid)) {
        bot.remModerator(us.userid);
      }
    }
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

  if (conf.saystats==true) {
    bot.speak(cs.song + ' stats: up: ' + cs.up + ' down: ' + cs.down +
      ' snag: ' + cs.snags);
  }
  enforceRoom();
});

bot.on('add_dj', function (data) {
  if (data.user[0].userid == conf.USERID) {
    amdj = true;
    wantdj = false;
  }
  users[data.user[0].userid].isDj = true;
  if (isBannedDJ(data.user[0].userid)) {
    bot.remDj(data.user[0].userid);
    bot.speak('User ' + data.user[0].name + ' is not allowed to DJ here.');
  }
  if (djannounce) {
    bot.speak('Hi ' + data.user[0].name + ' ' + djannounce);
  }
  djs = djs + 1;
  console.log("DJUP: " + data.user[0].name);
});

bot.on('rem_dj', function (data) {
  if (data.user[0].userid == conf.USERID) {
    amdj = false;
    forcedj=false;
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
  checkBan(data.user[0].userid);
  us.isDj = false;
  us.warns = [];
  us.lastActive = new Date();
  users[us.userid] = us;
  console.log("Join: " + us.name);
  if (isDemod(data.user[0].userid)) {
    if (ismod(data.user[0].userid)) {
      bot.remModerator(data.user[0].userid);
    }
  }
});

bot.on('new_moderator', function (data) {
  if (isDemod(data.userid)) {
    bot.remModerator(data.userid);
  }
});

bot.on('deregistered', function (data) {
  delete users[data.user[0].userid];
  console.log("Part: " + data.user[0].name);
});

bot.on('booted_user', function (data) {
  m = users[data.modid];
  u = users[data.userid];
  console.log("Boot: " + u.name + " by " + m.name + " Reason: " + data.reason);
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
    User.findById(uid, function(err, doc) {
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

  if (isignore(source.userid)) {
    return;
  }

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
        conf.saystats = !conf.saystats;
        emote(source,'Saystats set to: ' + conf.saystats);
        return;
      case 'dance':
        conf.dance = !conf.dance;
        emote(source,'Dance set to: ' + conf.dance);
        return;
      case 'idlewarn':
        conf.doidle = !conf.doidle;
        emote(source,'Idle announcements set to: ' + conf.doidle);
        return;
      case 'idleenforce':
        conf.idleenforce = !conf.idleenforce;
        emote(source,'Idle Enforcement set to: ' + conf.idleenforce);
        return;
      case 'idlesettings':
        emote(source,"Idle Warn: " + conf.idlewarn + " Idle Limit: "
          + conf.idlelimit + " Idle Reset: " + conf.idlereset
          + " Idle Kick: " + conf.idlekick + " Min DJS: " + conf.mindjs);
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
        forcedj=true;
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
      case 'djdel':
        bot.playlistAll(function(resp) {
          for (var i=0; i<resp.list.length; i++) {
            if (resp.list[i]._id == args) {
              bot.playlistRemove(i);
              emote(source,'Removed ' + resp.list[i].metadata.song + ' from queue');
            }
          }
        });
        break;
      case 'djqueuelen':
        bot.playlistAll(function(resp) {
          emote(source,'I have ' + resp.list.length + ' songs in my queue');
        });
        break;
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
      case 'yank':
        u=findUser(args);
        if (u) {
          bot.remDj(u.userid);
        }
        break;
      case 'kick':
        user=args.split(/\s+/)[0];
        reason=args.slice(user.length).trim();
        u=findUser(user);
        if (u) {
          bot.bootUser(u.userid,reason);
        }
        return;
      case 'warn':
        u=findUser(args);
        if (u) {
          bot.speak('@' + args + ' - You have been officially warned. ' +
              ' Please read the room rules');
          u.warns.push(new Date());
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
      case 'mod':
        if (source.type=='C') return;
        u=findUser(args);
        if (u) {
          bot.addModerator(u.userid);
          emote(source,'Gave mod to ' + args);
        } else {
          emote(source,'User ' + args + ' not found');
        }
        break;
      case 'demod':
        if (source.type=='C') return;
        u=findUser(args);
        if (u) {
          bot.remModerator(u.userid);
          emote(source,'Removed mod from ' + args);
        } else {
          emote(source,'User not found');
        }
        break;
      case 'bandj':
        u=findUser(args);
        if (u) {
          if (isBannedDJ(u.userid)) {
            emote(source,'User ' + u.name + ' is already banned from DJing');
            return;
          }
          banneddj.push(u.userid);
          if (u.isDj == true) {
            bot.remDj(u.userid);
            bot.speak('User ' + u.name + ' is not allowed to DJ here.');
          }
          DBConfig.save('banneddj',banneddj,function(err,docs) {});
          emote(source,'User ' + u.name + ' banned from DJing');
        }
        break;
      case 'ban':
        if (args.substring(0,1) == '!') {
          uid = args.substring(1);
          name = args.substring(1);
          if (isBanned(uid)) {
            emote(source,'Userid ' + uid + ' is already banned');
            return;
          }
        } else {
          u=findUser(args);
          if (u) {
            uid=u.userid;
            name=u.name;
          }
        }
        if (isBanned(uid)) {
          emote(source,'User ' + name + ' is already banned');
          return;
        }
        banned.push(uid);
        if (users.hasOwnProperty(uid)) {
          bot.bootUser(u.userid,'User is banned from room');
        }
        DBConfig.save('banned',banned,function(err,docs) {});
        emote(source,'User ' + name + ' banned from room');
        break;
      case 'unbandj':
        u=findUser(args);
        if (u) {
          if (!isBannedDJ(u.userid)) {
            emote(source,'User ' + u.name + ' is not banned from DJing');
          } else {
            t = banneddj.indexOf(u.userid);
            if (t!=-1) banneddj.splice(t, 1);
            DBConfig.save('banneddj', banneddj, function(err,docs) {});
            emote(source,'Unbanned ' + u.name + ' from DJing');
          }
        }
        break;
      case 'unban':
        doUnban(source, args);
        break;
    }
  }
}

function doUnban(source, args) {
  name = args.toLowerCase();
  u=findUser(name);
  if (u) {
    if (!isBanned(u.userid)) {
      emote(source,'User ' + u.name + ' is not banned');
    } else {
      t = banned.indexOf(u.userid);
      if (t!=-1) banned.splice(t, 1);
      DBConfig.save('banned', banned, function(err,docs) {});
      emote(source,'Unbanned ' + u.name);
    }
  } else {
    User.findOne({ lowername: name },  function(err,docs) {
      if (docs) {
        t = banned.indexOf(docs._id);
        if (t!=-1) banned.splice(t,1);
        DBConfig.save('banned', banned, function(err,docs) {});
        emote(source,'Unbanned ' + docs.name);
      } else {
        emote(source,'User ' + u.name + ' not found');
      }
    });
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
  if (!isop(source.userid) && !ismod(source.userid) && conf.dance == false) {
    return;
  }
  if (isignore(cs.djid)) {
    return;
  }
  if (!voteup) {
  setTimeout(function() {
    bot.vote('up'); },
    2750 + (Math.floor(Math.random()*6)*1000)
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
    if (!meta.current_song) return;
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

function isignore(userid) {
  for (var i = 0; i < conf.ignore.length; i++) {
    if (userid == conf.ignore[i]) {
      return true;
    }
  }
  return false;
}

function isop (userid) {
  for (var i = 0; i < conf.ops.length; i++) {
    if (userid == conf.ops[i]) {
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
  if (djs < conf.mindjs) { return; }
  for (var u in users) {
    if (users[u].isDj == false) { continue; }
    // Do the idle check so we can just compare
    checkIdle();
    if (now - users[u].lastActive > (conf.idlekick * 60000)) {
      if (conf.idleenforce == true) {
        console.log("Idle Kick: " + users[u].name);
        bot.remDj(users[u].userid);
        bot.speak("Removing " + users[u].name + " for inactivity");
      }
      continue;
    }
    if (users[u].warns.length >= conf.idlelimit) {
      console.log("Idle Limit: " + users[u].name);
      if (conf.doidle) {
        bot.speak("Sorry " + "@" + users[u].name + " you're idle more than " +
            conf.idlelimit + " times in " + conf.idlereset/60 + " hour(s). " +
            " Feel free to hop back up when you return.");
      }
      if (conf.idleenforce == true) {
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
      if (now - users[u].warns[i] > (conf.idlereset * 60000)) {
        users[u].warns.splice(i,1);
      }
    }
    if (users[u].isDj == true) {
      if (now - users[u].lastActive > (conf.idlewarn * 60000)) {
        // Don't due stuff if it's too soon
        if (users[u].warns.length > 0 &&
            (now - users[u].warns[users[u].warns.length-1]) <
            (conf.idlewarn * 60000)) { continue; }
        // Add new warning
        users[u].warns.push(now);
        if (djs > conf.mindjs &&
            users[u].warns.length < (conf.idlelimit+1)) {
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
          if (conf.doidle) {
            bot.speak("@" + users[u].name + " - " + warn +
                " warning - idle > " + conf.idlewarn + " mins " +
               "in " + conf.idlereset/60 + " hours.  Please be active "+
               conf.idlewarn + "x" + conf.idlelimit);
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

function checkDead() {
  var now=new Date();
  if (now - bot.lastActivity > conf.dead * 60000) {
    log('Heartbeat Expired - killing bot for reconnect');
    process.exit(1);
  }
}

function jInit() {
  DBConfig.getValue('banneddj', function(err, data) {
    log(err);
    x = data;
    if (data=="") return;
    banneddj=data.value;
  });
  DBConfig.getValue('banned', function(err, data) {
    log(err);
    x = data;
    if (data=="") return;
    banned=data.value;
  });
  conf.demod = [];
  DBConfig.getValue('demod', function(err, data) {
    log(err);
    if (data=="") return;
    conf.demod=data.value;
  });
}

function isBannedDJ (userid) {
  var isbdj=false;
  for (var d=0; d<banneddj.length; d++) {
    if (banneddj[d] == userid) {
      isbdj=true;
      break;
    }
  }
  return isbdj;
}

function isBanned (userid) {
  var isbanned=false;
  for (var d=0; d<banned.length; d++) {
    if (banned[d] == userid) {
      isbanned=true;
      break;
    }
  }
  return isbanned;
}

function isDemod(userid) {
  var isdemod = false;
  for (var d=0; d<conf.demod.length; d++) {
    if (conf.demod[d] == userid) {
      isdemod=true;
      break;
    }
  }
  return isdemod;
}

function checkBan(userid) {
  if (isBanned(userid)) {
    bot.bootUser(userid,'User is banned from room');
  }
}

setTimeout(jInit, 500);
setInterval(checkDead, 10000);
setInterval(checkIdle, 10000);

if (interactive == true) {
  repl.start('> ').context.bot = bot;
}


