var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect('mongodb://localhost/jsbot');

var User = new Schema({
  lastActive: { type: Date, default: Date.now },
  name: { type: String, index: true },
  lowername: { type: String, index: true },
  recordplay: { type: Schema.ObjectId, ref: 'Play'},
  record: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
  lastDj: Date,
  plays: { type: Number, default: 0 },
  ups: { type: Number, default: 0 },
  downs: { type: Number, default: 0 },
  snags: { type: Number, default: 0 },
  oldnames: [String]
});


var Artist = new Schema({
  name: String,
  lowername: { type: String, index: true },
  plays: { type: Number, default: 0 },
  ups: { type: Number, default: 0 },
  downs: { type: Number, default: 0 },
  snags: { type: Number, default: 0 }
});

var Song = new Schema({
  name: String,
  album: String,
  artist: { type: Schema.ObjectId, ref: 'Artist', index: true },
  plays: { type: Number, default: 0 },
  ups: { type: Number, default: 0 },
  downs: { type: Number, default: 0 },
  snags: { type: Number, default: 0 }
});

var Play = new Schema({
  dj: { type: Schema.ObjectId, ref: 'User' },
  listeners: { type: Number, default: 0 },
  ups: { type: Number, default: 0 },
  downs: { type: Number, default: 0 },
  snags: { type: Number, default: 0 },
  song: { type: Schema.ObjectId, ref: 'Song' },
  played: { type: Date, default: Date.now },
  score: { type: Number, default: 0, index: true }
});

var Config = new Schema({
  key: { type: String, index: true },
  value: [String],
});

Song.statics.foc = function(id, name, artistid, cb) {
  s = this;
  s.findById(id, function(err,docs) {
    if (docs) {
      cb(err,docs);
    } else {
      var i = new SongModel({
        _id: id,
        name: name,
        artist: artistid
      });
      i.save(function(err) {
        cb(err,i);
      });
    }
  });
};

Artist.statics.foc = function(name, cb) {
  a = this;
  lowername = name.toLowerCase();
  a.findOne({lowername: lowername}, function(err, docs) {
    if (docs) {
      cb(err, docs);
    } else {
      var i = new ArtistModel({
        name: name,
        lowername: lowername
      });
      i.save(function(err) {
        cb(err, i);
      });
    }
  });
};

User.statics.foc = function(id, name, cb) {
  u = this;
  lowername=name.toLowerCase();
  (function(lowername) {
    u.findById(id, function(err,docs) {
      if (docs) {
        if (docs.lowername!=lowername) {
          docs.oldnames.push(docs.lowername);
          docs.name = name;
          docs.lowername = lowername;
          docs.save(function(err) {
            cb(err,docs);
          });
        } else {
          cb(err,docs);
        }
      } else {
        var i = new UserModel({
          _id: id,
          name: name,
          lowername: lowername
        });
        i.save(function(err) {
        cb(err,i);
        });
      }
    });
  })(lowername);
};

Play.statics.foc = function(id, cb) {
  p=this;
  p.findById(id, function(err,docs) {
    if (docs) {
      cb(err,docs);
    } else {
      var i = new PlayModel({
      });
      i.save(function(err) {
        cb(err,i);
      });
    }
  });
};

// Returns a play with the DJ and Song populated - need to get artist if needed
Play.statics.getPlay = function(id, cb) {
  p=this;
  p.findById(id).populate('dj').populate('song')
    .run(function(err,doc) {
      cb(err,doc);
  });
}

Song.statics.getSong = function(id, cb) {
  s = this;
  s.findById(id).populate('artist').run(function(err,doc) {
    cb(err,doc);
  });
}

Config.statics.getValue = function(key, cb) {
  c = this;
  c.findOne({key: key}, function(err, docs) {
    if (docs) {
      cb(err, docs);
    } else {
      return(err, "");
    }
  });
}

Config.statics.save = function(key, val,  cb) {
  c = this;
  c.findOne({key: key}, function(err, docs) {
    if (docs) {
      docs.value = val;
      docs.save(function(err) {
        cb(err, docs);
      });
    } else {
      var c = new ConfigModel({
        key: key,
        value: val
      });
      c.save(function(err) {
        cb(err,c);
      });
    }
  });
}

var UserModel = mongoose.model('User', User);
var ArtistModel = mongoose.model('Artist', Artist);
var SongModel = mongoose.model('Song', Song);
var PlayModel = mongoose.model('Play', Play);
var ConfigModel = mongoose.model('Config', Config);

exports.User = UserModel;
exports.Artist = ArtistModel;
exports.Song = SongModel;
exports.Play = PlayModel;
exports.DBConfig = ConfigModel;
