const { src, dest } = require('gulp');

function buildIcons() {
  return src('src/nodes/**/*.svg').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
