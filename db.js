var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect('mongodb://localhost/jsbot');

var User = new Schema({
  lastActive: { type: Date, default: Date.now },
  name: { type: String, index: true },
  recordplay: { type: Schema.ObjectId, ref: 'Play'},
  record: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
  lastDj: Date,
  plays: { type: Number, default: 0 },
  ups: { type: Number, default: 0 },
  downs: { type: Number, default: 0 },
  snags: { type: Number, default: 0 }
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
  u.findById(id, function(err,docs) {
    if (docs) {
      cb(err,docs);
    } else {
      var i = new UserModel({
        _id: id,
        name: name
      });
      i.save(function(err) {
        cb(err,i);
      });
    }
  });
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

var UserModel = mongoose.model('User', User);
var ArtistModel = mongoose.model('Artist', Artist);
var SongModel = mongoose.model('Song', Song);
var PlayModel = mongoose.model('Play', Play);

exports.User = UserModel;
exports.Artist = ArtistModel;
exports.Song = SongModel;
exports.Play = PlayModel;
