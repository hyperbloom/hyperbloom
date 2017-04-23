'use strict';

const assert = require('assert');
const path = require('path');
const debug = require('debug')('hyperbloom');
const sodium = require('sodium-universal');
const swarm = require('discovery-swarm');
const constants = require('hyperbloom-constants');
const Node = require('hyperbloom-node');
const Storage = require('hyperbloom-value-storage');
const Trust = require('hyperbloom-trust');
const Parser = require('hyperbloom-protocol').Parser;

const HASH_SIZE = constants.HASH_SIZE;
const HASH_KEY = constants.HASH_KEY;

function HyperBloom(options) {
  this.options = Object.assign({}, options);
  assert.equal(typeof this.options.storage, 'string',
               '`options.storage` must be a String');

  this.trust = new Trust(Object.assign({
    publicKey: this.options.publicKey,
    privateKey: this.options.privateKey
  }, this.options.trust));

  this.nodes = new Map();

  this.swarm = swarm();
  this.swarm.on('connection', (socket, info) => {
    debug('connection host=%s port=%d type=%s', info.host, info.port,
          info.type);
    this._onConnection(socket, info);
  });
}
module.exports = HyperBloom;

HyperBloom.prototype.listen = function listen(port, callback) {
  if (typeof port === 'function') {
    callback = port;
    port = 0;
  } else if (port === undefined) {
    port = 0;
  }

  let onError;

  const done = () => {
    this.swarm.removeListener('error', onError);
  };

  onError = (err) => {
    // Retry on non-random port
    if (port === 0)
      this.swarm.listen(PORT, done);
  };

  this.swarm.listen(port, done);
  this.swarm.once('error', onError);
};

HyperBloom.prototype.close = function close(cb) {
  let waiting = 2;

  const done = () => {
    if (--waiting === 0)
      return cb();
  };

  this.swarm.close(done);
  this.trust.close(done);
};

HyperBloom.prototype.join = function join(feedKey, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = Object.assign({
    full: true
  }, options);

  if (this.nodes.has(feedKey))
    return process.nextTick(callback, new Error('Already joined'));

  this.trust.getChain(feedKey, (err, chain) => {
    if (err)
      return callback(err);

    const discoveryKey = this._discoveryKey(feedKey);

    let storage = null;
    if (options.full) {
      storage = new Storage({
        backend: new Storage.backends.File(
            path.join(this.options.storage, discoveryKey.toString('hex')))
      });
    }

    const node = new Node({
      full: options.full,
      feedKey,
      privateKey: this.options.privateKey,
      storage,
      trust: this.trust,
      chain
    });
    this.nodes.set(discoveryKey.toString('hex'), node);

    this.swarm.join(discoveryKey);

    callback(null, node);
  });
};

HyperBloom.prototype._discoveryKey = function _discoveryKey(input) {
  const out = Buffer.alloc(HASH_SIZE);
  sodium.crypto_generichash(out, input, HASH_KEY);
  return out;
};

HyperBloom.prototype._onConnection = function _onConnection(socket,
                                                            info,
                                                            preparse) {
  if (info.channel) {
    const channelHex = info.channel.toString('hex');
    // Unknown channel (should not happen, though, since we created this)
    if (!this.nodes.has(channelHex))
      return socket.destroy();

    this.nodes.get(channelHex).addPeer(socket, preparse);
    return;
  }

  // TODO(indutny): log errors
  const onError = () => socket.destroy();
  socket.on('error', onError);

  const parser = new Parser();
  parser.once('open', (open, extra) => {
    socket.unpipe(parser);
    socket.removeListener('error', onError);
    this._onConnection(socket, { channel: open.feed }, {
      open,
      extra
    });
  });

  socket.pipe(parser);
};
