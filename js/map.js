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

    var i;
    for (i in map.tilesets) {
      tileSetImages[i] = new Image();
      tileSetImages[i].onload = function() {
        // Check if all tilSetImages are loaded:
        var j, complete = true;
        for (j in tileSetImages) {
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
    var tileset_i;
    for (tileset_i in tileSetImages) {
      var tileset = map.tilesets[tileset_i];
      var nperrow = Math.floor(tileset.imagewidth / tileset.tilewidth);
      var totaln = nperrow * Math.floor(tileset.imageheight / tileset.tileheight);

      var i;
      for (i = 0; i < totaln; i++) {
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
    var x, y;
    for (x = leftColX; x < leftColX + tileBufferArray.length; x++) {
      for (y = topRowY; y < topRowY + tileBufferArray[0].length; y++) {
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
      display.background.add(tile);
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
    if (tileImages[tileNumber]) {
      tile.setImage(tileImages[tileNumber]);
    } else {
      tile.setImage(emptyTileImage);
    }
    tile.x(x * tileSizePixels.width);
    tile.y(y * tileSizePixels.height);
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
      var y;
      for (y = topRowY; y < topRowY + tileBufferArray[0].length; y++) {
        loadTile(newColX, y);
      }
    }
    if (newRowY !== undefined) {
      var x;
      for (x = leftColX; x < leftColX + tileBufferArray.length; x++) {
        loadTile(x, newRowY);
      }
    }

    var N = 4;
    var target = {
      x: -view.x * tileSizePixels.width,
      y: -view.y * tileSizePixels.height
    };
    var n = 0;

    function movingFunction() {
      n++;
      display.background.setX(Math.round((target.x - viewPixels.x) * n / N) + viewPixels.x);
      display.background.setY(Math.round((target.y - viewPixels.y) * n / N) + viewPixels.y);
      display.backgroundLayer.draw();
      if (n == N) {
        viewPixels.x = target.x;
        viewPixels.y = target.y;
        window.clearInterval(movingFunctionId);
        moving = false;

        // Continue moving
        /*if (input.inputStates[direction].pressed) { shiftView(direction); }
        else if (input.inputStates[INPUT.UP].pressed) { shiftView(DIRECTION.UP); }
        else if (input.inputStates[INPUT.DOWN].pressed) { shiftView(DIRECTION.DOWN); }
        else if (input.inputStates[INPUT.LEFT].pressed) { shiftView(DIRECTION.LEFT); }
        else if (input.inputStates[INPUT.RIGHT].pressed) { shiftView(DIRECTION.RIGHT); }*/
      }
    };

    movingFunctionId = window.setInterval(movingFunction, 30);
  }

  /*============================= INITIALISE =================================*/
  // Load empty image
  emptyTileImage = new Image();
  // TODO: make image path part of config?
  emptyTileImage.src = "img/empty.png";

  var inputEventHandlers = {};
  inputEventHandlers[INPUT.UP] = function() { shiftView(DIRECTION.UP) };
  inputEventHandlers[INPUT.DOWN] = function() { shiftView(DIRECTION.DOWN) };
  inputEventHandlers[INPUT.LEFT] = function() { shiftView(DIRECTION.LEFT) };
  inputEventHandlers[INPUT.RIGHT] = function() { shiftView(DIRECTION.RIGHT) };

  return {
    loadMap: loadMap,
    loadView: loadView,
    inputEventHandlers: inputEventHandlers
  };
}
