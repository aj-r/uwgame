function MapManager(display, input) {
  /*============================= VARIABLES ==================================*/
  // Keep track of whether the map is currently moving
  var moving = false;
  var movingFunctionId = null;

  // Map coordinates of the view. Indicates which tiles are currently in the view.
  var view = { x: 0, y: 0, width: null, height: null };

  // Map-pixel coordinates of view
  var viewPixels = { x: 0, y: 0 };

  // Array of tileset images and individual tile images
  var tileSetImages = [];
  var tileImages = [];

  // Empty tiles image
  var emptyTileImage = null;

  // Buffer for tiles on screen, and indexes for positions
  var tileBufferArray = null;
  var leftColI = null;
  var topRowJ = null;
  var leftColX = null;
  var topRowY = null;

  // Number of tiles each side of the view to load
  var TILE_BUFFER_SIZE = 1;

  // Layer information for background image
  var bgLayer = null;

  // Tile size (set by map in initialiseMap)
  var tileSizePixels = { width: null, height: null };

  // Map (loaded from the Tiled JSON file)
  var map = null;

  // A hidden canvas used for image operations, such as combining background tiles into one big image
  var hiddenCanvas = document.createElement("canvas");
  hiddenCanvas.width = "10000";
  hiddenCanvas.height = "10000";
  var hiddenCtx = hiddenCanvas.getContext("2d");

  var tempCanvas = document.createElement("canvas");
  tempCanvas.style.border = "black 1px solid";
  tempCanvas.width = "1000";
  tempCanvas.height = "1000";
  var tempCtx = tempCanvas.getContext("2d");

  /*============================= FUNCTIONS ==================================*/
  // Load a new map file
  function loadMap(url, x, y) {
    // Remove old tilesets:
    tileSetImages = [];
    tileImages = [];

    // Load JSON file
    $.getJSON(url, function(json) {
      map = json;
      initialiseMap();
      loadTileSets(function() {
        makeTileImages();
        loadView(x, y);
        display.backgroundLayer.draw();
      });
    });
  }

  // Misc setup functions after JSON file has been loaded
  function initialiseMap() {
    // Set tile size and view size
    tileSizePixels.height = map.tileheight;
    tileSizePixels.width = map.tilewidth;
    view.width = Math.ceil(display.stageSizePixels.width / tileSizePixels.width);
    view.height = Math.ceil(display.stageSizePixels.height / tileSizePixels.height);

    // Find the bg layer, and extract data
    var i;
    for (i in map.layers) {
      if (map.layers[i].name == "bg") {
        bgLayer = map.layers[i];
        break;
      } else if (i >= map.layers.length) {
        console.warning("No bg layer found for map!");
        return;
      }
    }

    // Form (or reform) buffer for tiles on screen
    tileBufferArray = new Array(view.width + TILE_BUFFER_SIZE * 2);
    for (i = 0; i < tileBufferArray.length; i++) {
      tileBufferArray[i] = new Array(view.height + TILE_BUFFER_SIZE * 2);
    }

    // TODO: reload player image if tilesize changed?
  }

  // Load tileset images
  function loadTileSets(nextFun) {
    tileSetImages = new Array(map.tilesets.length);

    for (var i in map.tilesets) {
      tileSetImages[i] = new Image();
      tileSetImages[i].onload = function() {
        // Check if all tilSetImages are loaded:
        var complete = true;
        for (var j in tileSetImages) {
          if (!tileSetImages[j].complete) {
            complete = false;
          }
        }
        if (complete && nextFun) {
          nextFun();
        }
      };
      // TODO: make the path configurable?
      tileSetImages[i].src = "img/" + map.tilesets[i].image;
    }
  }

  // Crop all the tileset images to the individual tile images
  function makeTileImages() {
    for (var tileset_i in tileSetImages) {
      var tileset = map.tilesets[tileset_i];
      var nperrow = Math.floor(tileset.imagewidth / tileset.tilewidth);
      var totaln = nperrow * Math.floor(tileset.imageheight / tileset.tileheight);

      for (var i = 0; i < totaln; i++) {
        // Define crop rectangle
        var rect = {
          left: (i % nperrow) * tileset.tilewidth,
          top: Math.floor(i / nperrow) * tileset.tileheight,
          width: tileset.tilewidth,
          height: tileset.tileheight
        };
        tileImages[tileset.firstgid + i] = Pixastic.process(tileSetImages[tileset_i], "crop", rect);
      }
    }
  }

  // Load all tiles in given view area
  function loadView(x, y) {
    // Set view
    view.x = x;
    view.y = y;
    viewPixels.x = -view.x * tileSizePixels.width;
    viewPixels.y = -view.y * tileSizePixels.height;

    leftColI = 0;
    leftColX = view.x - TILE_BUFFER_SIZE;
    topRowJ = 0;
    topRowY = view.y - TILE_BUFFER_SIZE;
    for (var x = leftColX; x < leftColX + tileBufferArray.length; x++) {
      for (var y = topRowY; y < topRowY + tileBufferArray[0].length; y++) {
        loadTile(x, y);
      }
    }

    display.background.setX(viewPixels.x);
    display.background.setY(viewPixels.y);
    display.backgroundLayer.draw();
  }

  // Reload the tile at x, y - create if necessary
  function loadTile(x, y) {
    if (x < leftColX || x >= leftColX + tileBufferArray.length ||
       y < topRowY || y >= topRowY + tileBufferArray[0].length) {
      console.warning("Attempt to create tile OOB of tileBufferArray");
      return;
    }

    // tileBufferArray indexes
    var i = (x - leftColX + leftColI) % tileBufferArray.length;
    var j = (y - topRowY + topRowJ) % tileBufferArray[0].length;

    // Ensure tile exists
    var tile = tileBufferArray[i][j];
    if (tile === undefined) {
      tile = new Kinetic.Image();
      tileBufferArray[i][j] = tile;
      //display.background.add(tile);
    }

    // tileNumber
    var bg_index = x + y * bgLayer.width;
    var tileNumber
    if (x >= 0 && y >= 0 && bg_index < bgLayer.data.length) {
      tileNumber = bgLayer.data[bg_index];
    } else {
      // OOB x and y - show empty tile
      tileNumber = 0;
    }

    // Set the tile properties
    var tileImage;
    if (tileImages[tileNumber]) {
      tileImage = new Image();
      tileImage.src = tileImages[tileNumber].toDataURL();
    } else {
      tileImage = emptyTileImage;
    }
    tile.setImage(tileImage);
    tile.setX(x * tileSizePixels.width);
    tile.setY(y * tileSizePixels.height);

    var pos = { x: tile.getX(), y: tile.getY() };
    hiddenCtx.drawImage(tileImage, pos.x, pos.y);
  }

  /* Shift buffer to tiles one over, reload the new tiles
     Does not move the screen
     Does now redraw the screen
   */
  function shiftView(direction) {
    if (moving) {
      return;
    }
    moving = true;
    switch (direction) {
      case DIRECTION.LEFT:
        view.x--;
        leftColX--;
        leftColI = (leftColI - 1 + tileBufferArray.length) % tileBufferArray.length;
        var newColX = leftColX;
        break;
      case DIRECTION.RIGHT:
        view.x++;
        leftColX++;
        leftColI = (leftColI + 1) % tileBufferArray.length;
        var newColX = leftColX + tileBufferArray.length - 1;
        break;
      case DIRECTION.DOWN:
        view.y++;
        topRowY++;
        topRowJ = (topRowJ + 1) % tileBufferArray.length;
        var newRowY = topRowY + tileBufferArray[0].length - 1;
        break;
      case DIRECTION.UP:
        view.y--;
        topRowY--;
        topRowJ = (topRowJ - 1 + tileBufferArray.length) % tileBufferArray.length;
        var newRowY = topRowY;
        var x;
        break;
      default:
        return;
    }

    if (newColX !== undefined) {
      for (var y = topRowY; y < topRowY + tileBufferArray[0].length; y++) {
        loadTile(newColX, y);
      }
    }
    if (newRowY !== undefined) {
      for (var x = leftColX; x < leftColX + tileBufferArray.length; x++) {
        loadTile(x, newRowY);
      }
    }
    var imageData = hiddenCtx.getImageData(
      (view.x - TILE_BUFFER_SIZE) * tileSizePixels.width,
      (view.y - TILE_BUFFER_SIZE) * tileSizePixels.height,
      (view.width + TILE_BUFFER_SIZE * 2) * tileSizePixels.width,
      (view.height + TILE_BUFFER_SIZE * 2) * tileSizePixels.height);
    tempCtx.putImageData(imageData, 0, 0);
    var backgroundImage = new Image();
    backgroundImage.src = tempCanvas.toDataURL();
    display.background2.setImage(backgroundImage);

    var duration = 300; // milliseconds
    var frameRate = 30; // fps
    var totalFrames = duration / frameRate;
    var target = {
      x: -view.x * tileSizePixels.width,
      y: -view.y * tileSizePixels.height
    };
    var currentFrame = 0;

    function movingFunction() {
      var now = new Date();
      console.info(now.getMilliseconds());
      currentFrame++;
      display.background.setX(Math.round((target.x - viewPixels.x) * currentFrame / totalFrames) + viewPixels.x);
      display.background.setY(Math.round((target.y - viewPixels.y) * currentFrame / totalFrames) + viewPixels.y);
      display.backgroundLayer.draw();
      if (currentFrame == totalFrames) {
        viewPixels.x = target.x;
        viewPixels.y = target.y;
        clearInterval(movingFunctionId);
        moving = false;

        // Continue moving
        if (input.getInputState(direction).pressed) shiftView(direction);
        else if (input.getInputState(INPUT.UP).pressed) shiftView(DIRECTION.UP);
        else if (input.getInputState(INPUT.DOWN).pressed) shiftView(DIRECTION.DOWN);
        else if (input.getInputState(INPUT.LEFT).pressed) shiftView(DIRECTION.LEFT);
        else if (input.getInputState(INPUT.RIGHT).pressed) shiftView(DIRECTION.RIGHT);
      }
    };

    movingFunctionId = setInterval(movingFunction, frameRate);
  }

  /*============================= INITIALISE =================================*/
  // Load empty image
  emptyTileImage = new Image();
  // TODO: make image path part of config?
  emptyTileImage.src = "img/empty.png";

  var inputEventPress = {};
  inputEventPress[INPUT.UP] = function() { shiftView(DIRECTION.UP) };
  inputEventPress[INPUT.DOWN] = function() { shiftView(DIRECTION.DOWN) };
  inputEventPress[INPUT.LEFT] = function() { shiftView(DIRECTION.LEFT) };
  inputEventPress[INPUT.RIGHT] = function() { shiftView(DIRECTION.RIGHT) };

  /*=========================== GET/SET FUNCTIONS ============================*/
  function getInputEventPress() { return inputEventPress; }

  return {
    loadMap: loadMap,
    loadView: loadView,
    getInputEventPress: getInputEventPress
  };
}