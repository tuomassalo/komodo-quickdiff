komodo-quickdiff
================

A Komodo Edit/IDE extensions that adds inline diff indicators, placed in left margin.

![Example](https://venko.net/komodo-quickdiff/example.png)

Features
--------

* hunk (change) level reverting by clicking on the margin markers
* support for git, Subversion and plain files
* local and remote files (sftp)

Note: Linux/Mac only. Windows is not supported.

License
-------

This extension is available under the Mozilla Public License 1.1.

Contributing
------------

* support for other VCS's can be added in `content/js/quickdiff_providers.js`. See the `asSvn` function for an example.
* build with `koext build --unjarred`
