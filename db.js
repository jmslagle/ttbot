var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect('mongodb://localhost/jsbot');

var User = new Schema({
  lastActive: { type: Date, default: Date.now },
  name: { type: String, index: true },
  recordplay: { type: Schema.ObjectId, ref: 'Play'},
  id: String,
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
  song: { type: Schema.ObjectId, ref: 'Song' }
});

Artist.statics.foc = function(name, i, cb) {
  a = this;
  i.lowername = name.toLowerCase();
  a.findOne({lowername: i.lowername}, function(err, docs) {
    if (docs) {
      cb(err, docs);
    } else {
      i.name=name;
      i.save(function(err) {
        a.findOne({lowername: i.lowername}, function(err, docs) {
          cb(err, docs);
        });
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
