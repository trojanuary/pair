const fs = require('fs');
let html = fs.readFileSync('src/index.html','utf8');
// IMPORTANT: use function replacements so `$`, `$$`, `$&`, `$1` in the JS are inserted verbatim
// (a string replacement would run String.replace's special-pattern substitution and corrupt the code).
const put = (target, file, wrap) => {
  const content = fs.readFileSync(file, 'utf8');
  html = html.replace(target, () => wrap[0] + content + wrap[1]);
};
put('<link rel="stylesheet" href="styles.css">', 'src/styles.css', ['<style>\n', '\n</style>']);
put('<script src="vendor/pdf.min.js"></script>', 'src/pdf.min.js', ['<script>\n', '\n</script>']);
put('<script src="pdf-worker-b64.js"></script>', 'src/pdf-worker-b64.js', ['<script>\n', '\n</script>']);
put('<script src="pdf-data.js"></script>', 'src/pdf-data.js', ['<script>\n', '\n</script>']);
put('<script src="app.js"></script>', 'src/app.js', ['<script>\n', '\n</script>']);
fs.writeFileSync('dist/reading-workspace.html', html);
console.log('built', (html.length/1024/1024).toFixed(2)+'MB');
