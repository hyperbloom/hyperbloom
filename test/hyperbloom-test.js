'use strict';

const assert = require('assert');
const path = require('path');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const signatures = require('sodium-signatures');

const HyperBloom = require('../');

const TMP_DIR = path.join(__dirname, 'tmp');
const A_DIR = path.join(TMP_DIR, 'a');
const B_DIR = path.join(TMP_DIR, 'b');

describe('HyperBloom', () => {
  const pair = signatures.keyPair();

  beforeEach(() => {
    rimraf.sync(TMP_DIR);
    mkdirp.sync(A_DIR);
    mkdirp.sync(B_DIR);
  });

  function bothJoin(a, b, channel, cb) {
    let waiting = 2;
    const nodes = [];
    const done = (err, node) => {
      if (err)
        return cb(err);

      nodes.push(node);
      if (--waiting == 0)
        return cb(null, nodes);
    };
    a.join(channel, done);
    b.join(channel, done);
  }

  it('should find and connect two nodes', (cb) => {
    const a = new HyperBloom({
      publicKey: pair.publicKey,
      privateKey: pair.secretKey,
      storage: A_DIR,
      trust: {
        db: path.join(A_DIR, 'trust.db')
      }
    });

    const b = new HyperBloom({
      publicKey: pair.publicKey,
      privateKey: pair.secretKey,
      storage: B_DIR,
      trust: {
        db: path.join(B_DIR, 'trust.db')
      }
    });

    a.listen();
    b.listen();

    bothJoin(a, b, pair.publicKey, (err, nodes) => {
      assert(!nodes[0].has(Buffer.from('hello')));
      nodes[0].bulkInsert([ Buffer.from('hello') ]);
      assert(nodes[0].has(Buffer.from('hello')));

      assert(!nodes[1].has(Buffer.from('hello')));
      const w = nodes[1].watch({
        start: Buffer.from('a'),
        end: Buffer.from('z')
      });
      w.on('values', (values) => {
        assert(nodes[1].has(Buffer.from('hello')));
        cb();
      });
    });
  });
});
