const path = require('path')
module.exports = {
  rootDir: path.join(__dirname, 'src'),
  testEnvironment: "node",
  "transform": {
    "^.+\\.tsx?$": "ts-jest"
  },
}
