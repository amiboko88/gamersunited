const express = require('express');
const app = express();
const { addDebugRoute } = require('./handlers/debugEndpoint');
addDebugRoute(app);
app.listen(process.env.PORT || 4000, () => { 
  console.log("Express debug server running on 4000"); 
});
