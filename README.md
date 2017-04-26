# HyperBloom

**Unstable**

Implementation of [HyperBloom protocol][0] node on top of [discovery-swarm][1].

## Community

There is a #hyperbloom channel on [FreeNode][4] where all questions will be
*eventually* answered.

## What is HyperBloom?

HyperBloom is a conflict-free distributed set with write-access controlled by
Trust Network. Every member of Trust Network is allowed to add new entries to
the set, and the set is later synchronized between everyone.

Direct application of such set may be a distributed multi-valued (several
values for one key) dictionary.

See [protocol specification][2] for details.

## Usage

```js
const HyperBloom = require('hyperbloom');

// Create node
const bloom = new HyperBloom({
  publicKey: pair.publicKey,
  privateKey: pair.secretKey,
  storage: '/path/to/storage',
  trust: {
    db: '/path/to/trust.db'
  }
});

// Connect node to the swarm
bloom.listen();

// Join particular HyperBloom feed
a.join(feedPublicKey, (err, node) => {
  // Watch values (existing and new)
  const w = node.watch({
    start: Buffer.from('a'),
    end: Buffer.from('z')
  });

  w.on('values', (values) => {
    console.log(values);

    // Stop watching
    node.unwatch(w);

    // Leave the feed
    a.leave(feedPublicKey);
  });
});
```

See [hyperbloom-node][3] for detailed `node` APIs.

## LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2017.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[0]: https://github.com/hyperbloom/hyperbloom-protocol
[1]: https://www.npmjs.com/package/discovery-swarm
[2]: https://github.com/hyperbloom/hyperbloom-protocol/blob/master/spec.md
[3]: https://github.com/hyperbloom/hyperbloom-node
[4]: https://freenode.net/
