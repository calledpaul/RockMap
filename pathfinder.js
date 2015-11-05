function pathFinder(){}
pathFinder.prototype = {
	climberUrl: 'res/climber.php',
	finishUrl: 'res/finish.php',
	finishSize: 38,
	climberSize: 48,
	iconSize: 38,
	//meters
	meterThreshold: 3,
	routeMagnetSize: 10,
	splitSize: 3,

	scale: 1,
	currentPath: [],
	currentDestination: null,
	currentPos: null,

	init: function(profile, containerId) {
		var me = this, i;
		this.coords = profile.coords;
		this.poi = profile.poi;
		this.segment = profile.segment;
		this.map = profile.map;
		var container = document.getElementById(containerId);

		this.updateDimentions();

		this.initGeoCoefficients();
		this.unique = this.getUniqueSegPoints();
		this.graph = new Graph(this.unique);
		var max = Math.max(me.winW, me.winH);
		this.draw = SVG(containerId).size(3000, 3000);
		this.drawGroup = this.draw.group();
		//this.drawGroup.move(me.xOffset >= 0 ? me.xOffset : 0, me.yOffset >= 0 ? me.yOffset : 0);

		this.drawImage = this.draw.image(this.map.url, this.map.w, this.map.h);
		this.drawGroup.add(this.drawImage);

		this.drawDemo();
		
		this.drawPath = this.draw.polyline([]);
		this.drawPath.fill('none').stroke({ width: 2, color: 'red'});

		this.drawIcons = [];
		for(var url in profile.icons) {
			if(profile.icons.hasOwnProperty(url)) {
				for(i=0; i<profile.icons[url].length; i++) {
					var icon = this.draw.image(url, this.iconSize, this.iconSize);
					this.drawGroup.add(icon);
					icon.move(profile.icons[url][i][0], profile.icons[url][i][1]);					
					this.drawIcons.push(icon);
				}
			}
		}
		this.drawLabels = [];
		for(i=0; i<profile.labels.length; i++) {
			var text = this.draw.text(profile.labels[i][2]).fill(profile.labels[i].length===4 ? profile.labels[i][3] : '#000');
			text.font({	family: 'Verdana', size: 12, weight: 'bold' });
			
			this.drawGroup.add(text);
			text.move(profile.labels[i][0], profile.labels[i][1]);
			this.drawLabels.push(text);
		}
		
		this.climber = this.draw.image(this.climberUrl, this.climberSize, this.climberSize);
		this.climber.hide();
		this.drawGroup.add(this.drawPath).add(this.climber);

		this.finishSign = this.draw.image(this.finishUrl, this.finishSize, this.finishSize);
		this.finishSign.hide();
		this.drawGroup.add(this.finishSign);

		Hammer(container, {
			prevent_default: true,
			no_mouseevents: true
		}).on('dragstart', function(e) {
			if(e.srcElement.nodeName.toLowerCase()!=='svg') {
				me.drawGroup.dragstart();
				me.dragStartX = e.gesture.center.pageX;
				me.dragStartY = e.gesture.center.pageY;
			}
		}).on('drag', function(e) {
			var offset = 20;
			var cx = me.dragStartX + e.gesture.deltaX,
				cy = me.dragStartY + e.gesture.deltaY;
			if(e.srcElement.nodeName.toLowerCase() !== 'svg' && 
				cx > offset && cx < me.winW - offset &&
				cy > offset && cy < me.winH - offset 
			) {
				me.drawGroup.drag(e.gesture.deltaX, e.gesture.deltaY);
			}
		}).on('transformstart', function (e) {
			me.drawGroup.transformstart(e.gesture.center.pageX, e.gesture.center.pageY);
		}).on('pinch rotate', function (e) {
			me.drawGroup.pinchRotate(e.gesture.scale, e.gesture.rotation);						
		}).on('transformend', function(e) {
			me.repositionSigns(true);
		});

		return this;
	},

	updateDimentions: function() {

		this.winW = "innerWidth" in window ? window.innerWidth :document.documentElement.offsetWidth;
		this.winH = "innerHeight" in window ? window.innerHeight : document.documentElement.offsetHeight;
		this.xCenter = this.winW/2;
		this.yCenter = this.winH/2;
		this.xOffset = (this.winW-this.map.w)/2;
		this.yOffset = (this.winH-this.map.h)/2;

		//var container = document.getElementById(containerId);
		//container.style.width = this.winW+'px';
		//container.style.height = this.winH+'px';
	},

	cursorPoint: function(evt, x, y, draw){
		var me = this, svg = me.draw.node;
		if(!me.svgCalcPoint) {
			me.svgCalcPoint = svg.createSVGPoint();
		}
		me.svgCalcPoint.x = x ? x : evt.clientX;
		me.svgCalcPoint.y = y ? y : evt.clientY;
		if(!draw) {
			draw = me.drawGroup;
		}
		var globalPoint = me.svgCalcPoint.matrixTransform(svg.getScreenCTM().inverse()),
			globalToLocal = draw.node.getTransformToElement(svg).inverse(),
			inObjectSpace = globalPoint.matrixTransform( globalToLocal );
		return inObjectSpace;
	},

	transformLocalToGlobal: function(x, y) {
		var me = this, svg = me.draw.node;
		if(!me.svgCalcPoint) {
			me.svgCalcPoint = svg.createSVGPoint();
		}
		me.svgCalcPoint.x = x;	
		me.svgCalcPoint.y = y;
		return me.svgCalcPoint.matrixTransform(me.drawGroup.node.getScreenCTM());
	},

	getGeoPos: function() {
		return this.geoPos ? this.geoPos : false;
	},

	/*************************** NAVIGATE ****************************/
	simulate: function() {
		var me = this;
		clearTimeout(me.simuInterval);
		var pointOnPathIndex = 1;
		me.simuInterval = setInterval(function() {
			if(++pointOnPathIndex < me.currentPath.length) {
				me.updatePath(pointOnPathIndex);
			}else{
				clearTimeout(me.simuInterval);
			}
		}, 300);
	},

	rotateMap: function(angle) {
		var me = this;	
		var decomposed = me.drawGroup.decomposeMatrix();
		if(angle !== decomposed.rotation) {
			var globalPoint = me.transformLocalToGlobal(me.currentPathPoint[0], me.currentPathPoint[1]);
			me.updateDimentions();
			me.drawGroup.mTransform({
				translate: {
					x: me.xCenter - globalPoint.x,
					y: me.yCenter - globalPoint.y
				},
				center: {
					x: me.xCenter,
					y: me.yCenter
				},
				rotate: angle-decomposed.rotation
			});
			me.repositionSigns(true);
		}		
	},

	hideSigns: function() {
		var i;
		this.climber.hide();
		for(i=0; i<this.drawIcons.length; i++) {
			this.drawIcons[i].hide();
		}
		for(i=0; i<this.drawLabels.length; i++) {
			this.drawLabels[i].hide();
		}
	},
	repositionSigns: function(animate) {
		var i;
		var mapRotateAngle = 360 - this.drawGroup.decomposeMatrix().rotation;
		if(Math.abs(this.climber.trans.rotation - mapRotateAngle) > 180) {
			animate = false;
		}
		for(i=0; i<this.drawIcons.length; i++) {			
			if(animate) {
				this.drawIcons[i].animate(200).rotate(mapRotateAngle);
			} else {
				this.drawIcons[i].rotate(mapRotateAngle);
			}
		}
		for(i=0; i<this.drawLabels.length; i++) {			
			if(animate) {
				this.drawLabels[i].animate(200).rotate(mapRotateAngle);
			} else {
				this.drawLabels[i].rotate(mapRotateAngle);	
			}
		}
		if(animate) {
			this.finishSign.animate(200).rotate(mapRotateAngle);
		} else {
			this.finishSign.rotate(mapRotateAngle);	
		}
		if(animate) {
			this.climber.animate(200).rotate(mapRotateAngle);
		} else {
			this.climber.rotate(mapRotateAngle);	
		}
	},

	updatePath: function(pointOnPathIndex) {
		var me = this, i, len = me.currentPath.length, drawPath = [],
			destPoint = me.getPoint(me.currentDestination),
			p = pointOnPathIndex === null ? me.currentPos : me.currentPath[pointOnPathIndex];
			
		me.climber.translate(p[0]-me.climberSize/2, p[1]-me.climberSize/2);
		me.currentPathPoint = p;

		if(pointOnPathIndex === null ) {
			drawPath.push(me.currentPos);
		} else if(pointOnPathIndex < len-1) {
			var v1, v2, angleInDegrees = 0, iterations = len-pointOnPathIndex <6 ? len-pointOnPathIndex-1 : 5;
			for(i=0; i<iterations; i++) {
				v1 = me.currentPath[pointOnPathIndex+i];
				v2 = me.currentPath[pointOnPathIndex+i+1];
				angleInDegrees += 360 - Math.atan2(v2[1]-v1[1], v2[0]-v1[0]) * 180 / Math.PI;
			}
			this.rotateMap(angleInDegrees/iterations-90);
		}
		for(i=pointOnPathIndex !== null ? pointOnPathIndex : 0; i<len; i++) {
			drawPath.push(me.currentPath[i]);
		}
		drawPath.push(destPoint);
		me.drawPath.plot(drawPath);
	},

	startNavigation: function(point) {
		var me = this;
		this.currentDestination = point;			
		this.navigationLoop = setInterval(function() {
			var end, i, closest, pathLen, pointOnPathIndex = null, geoPos = me.getGeoPos(), 
				newPos = geoPos ? me.convertGeoToPx(geoPos.lat, geoPos.long) : null;
			if(newPos && (!me.currentPos || me.meterDistance(newPos, me.currentPos) > me.meterThreshold)) {
				end = me.getPoint(me.currentDestination);
				pathLen = me.currentPath.length;
				if(pathLen) {
					closest = me.getClosestSegment(newPos[0], newPos[1], me.currentPath);
					if(closest && closest[1] < pathLen && closest[0]/me.meterRate < me.routeMagnetSize ) {
						pointOnPathIndex = closest[1];
					}else { //recalculation is needed
						me.currentPath = [];
					}
				}
				if(!me.currentPath.length) {
					me.currentPath = me.getPathFrom(newPos[0], newPos[1], end[0], end[1]);
					me.presplitPath(me.currentPath, me.splitSize);
					var finish = me.currentPath[me.currentPath.length-1];
					me.finishSign.move(finish[0]-me.finishSize/2, finish[1]-me.finishSize/2);
					me.finishSign.show();
				}
				me.currentPos = newPos;

//COMMENTED only for simulation				
				//me.updatePath(pointOnPathIndex);
			}
		}, 100);
		
		//me.climber.move(p[0]-me.climberSize/2, p[1]-me.climberSize/2);
		me.climber.show();
		me.climber.front();
	},

	endNavigation: function() {
		if(this.navigationLoop) {
			clearInterval(this.navigationLoop);
			this.navigationLoop = null;
		}
		this.climber.hide();
		this.finishSign.hide();
	},

	/*************************** CALCULATE PATH ****************************/

	getClosestSegment: function(x, y, plainSegmentData) {
		var point, i, distances = [],
			sortFunc = function(a, b) { return a[0] > b[0] ? 1 : -1; };
		if(plainSegmentData) {
			for(i=0; i< plainSegmentData.length; i++) {
				distances.push([this.pointDistance(plainSegmentData[i], [x, y]), i]);
			}
		} else {
			for(point in this.unique) {
				if(this.unique.hasOwnProperty(point)) {
					distances.push([this.pointDistance(point, [x, y]), point]);
				}
			}
		}
		distances.sort(sortFunc);
		return distances.length ? distances[0] : null;
	},

	getPathFrom: function(x1, y1, x2, y2) {
		var distanceA = this.getClosestSegment(x1, y1),
			distanceB = this.getClosestSegment(x2, y2);		
		if(this.pointDistance([x1,y1], [x2,y2]) < distanceA[0]) {
			return [];
		}
		return this.findShortestPath(distanceA[1], distanceB[1]);
	},

	findShortestPath: function (a, b) {
		var path = this.graph.findShortestPath(a, b);
		return path ? path : [];
	},

	/*************************** DISTANCE ****************************/

	calculatePOIDistances: function(p) {
		console.time('POI distances');
		var type, key, point, path, dist;
		for(type in this.poi) {
			if(this.poi.hasOwnProperty(type)) {
				console.log(type);
				for(key in this.poi[type]) {
					if(this.poi[type].hasOwnProperty(key)) {
						point = this.getPoint(key);									
						path = this.getPathFrom(p.x, p.y, point[0], point[1]);
						dist = this.pathDistance(path, true);
						if(!dist) {
							dist = this.meterDistance([p.x, p.y], [point[0], point[1]]);
						}
						this.poi[type][key].distance = dist;
						console.log(this.poi[type][key].title+' - '+Math.round(dist)+'m');
					}
				}
			}
		}
		console.timeEnd('POI distances');
	},

	pathDistance: function(path, meter) {
		var dist = 0;
		for(var i=0, len = path.length-1; i<len; i++) {
			dist += this.pointDistance(path[i], path[i+1]);
		}
		return meter ? dist/this.meterRate : dist;
	},

	getGeoDistance: function(lat1, lon1, lat2, lon2) {
		var R = 6378.137,
			dLat = (lat2 - lat1) * Math.PI / 180,
			dLon = (lon2 - lon1) * Math.PI / 180,
			a = Math.sin(dLat/2) * Math.sin(dLat/2) +
				Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
		return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1000);
	},

	pointDistance: function(a, b) {
		var start = typeof(a) === 'object' ? a : this.getPoint(a),
			end = typeof(b) === 'object' ? b : this.getPoint(b);
		return Math.round(Math.sqrt(Math.pow(Math.abs(start[0]-end[0]), 2)+Math.pow(Math.abs(start[1]-end[1]), 2))*100)/100;
	},

	meterDistance: function(a, b) {
		return this.pointDistance(a, b)/this.meterRate;
	},

	/*************************** DATA PREPARATION ****************************/

	initGeoCoefficients: function() {
		var key, point, longDistance, latDistance;
		this.maxLat = 0;
		this.maxLong = 0;
		this.minLat = this.coords[0][0];
		this.minLong = this.coords[0][1];
		
		for(key in this.coords) {
			point = this.coords[key];
			if(point[0] > this.maxLat){
				this.maxLat = point[0];
			}
			if(point[0] < this.minLat){
				this.minLat = point[0];
			}
			if(point[1] > this.maxLong){
				this.maxLong = point[1];
			}
			if(point[1] < this.minLong){
				this.minLong = point[1];
			}
		}
		//console.log([this.minLat, this.minLong], [this.maxLat, this.maxLong]);
		this.latDistance = this.getGeoDistance(this.minLat, this.minLong, this.maxLat, this.minLong);
		this.longDistance = this.getGeoDistance(this.minLat, this.minLong, this.minLat, this.maxLong);

		//this.map.w = this.longDistance*this.map.h/this.latDistance;		
		this.meterRate = this.map.h/this.latDistance;
		//console.log(this.latDistance+'('+this.map.w+')='+this.meterRate+' '+this.longDistance+'('+this.map.h+')='+this.meterRate);
		for(key in this.coords) {
			this.coords[key] = this.convertGeoToPx(this.coords[key][0], this.coords[key][1]);
		}
	},

	getUniqueSegPoints: function() {
		var i, seg, key, point, n, unique = {};
		for(i=0;i<this.segment.length;i++) {
			seg = this.segment[i];
			for(n=0;n<seg.length;n++) {
				point = seg[n];
				if(!unique[point]) {
					unique[point] = {};
				}
			}
		}
		for(key in unique) {
			for(i=0;i<this.segment.length;i++) {
				seg = this.segment[i];
				for(n=0;n<seg.length;n++) {
					point = seg[n];
					if(key == point) {
						if(n > 0) {
							unique[key][seg[n-1]] = this.pointDistance(key, seg[n-1]);
						}
						if(n+1 < seg.length) {
							unique[key][seg[n+1]] = this.pointDistance(key, seg[n+1]);
						}
					}
				}
			}
		}
		return unique;
	},

	presplitPath: function(path, meters) {
		var n, k, x1, y1, x2, y2, point, dist, splits, calcSplitDist, splitDist = this.meterRate*meters,
			nextX = function(x1, y1, x2, y2, d) {
				return Math.round(x1 - (x1-x2)/Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2))*d);
			}, nextY = function(x1, y1, x2, y2, d) {
				return Math.round(y1 - (y1-y2)/Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2))*d);
			};
		for(n=0; n<path.length; n++) {
			path[n] = this.getPoint(path[n]);
		}
		for(n=0; n<path.length-1; n++) {
			dist = this.pointDistance(path[n], path[n+1]); 
			if(dist > splitDist) {
				splits = Math.floor(dist/splitDist);
				calcSplitDist = splits >1 ? dist/splits : dist/2;
				x1 = path[n][0];
				y1 = path[n][1];
				x2 = path[n+1][0];
				y2 = path[n+1][1];
				for(k=0; k<splits; k++) { 
					point = [nextX(x1, y1, x2, y2, calcSplitDist), nextY(x1, y1, x2, y2, calcSplitDist)];
					if(this.pointDistance([x1, y1], point) > this.pointDistance([x1, y1], [x2, y2])) {
						break;
					}
					x1 = point[0];
					y1 = point[1];
					path.splice(++n, 0, point);
				}
			}
		}
	},

	/*************************** UTILS ****************************/

	getPoint: function(p) {
		return this.coords[p];
	},

	convertGeoToPx: function(lat, long) {
		return [
			this.getGeoDistance(this.minLat, this.minLong, this.minLat, long)*this.meterRate,
			this.map.h-this.getGeoDistance(this.minLat, this.minLong, lat, this.minLong)*this.meterRate,
		];
	},

	convertPxToGeo: function(x, y) {
		return {
			long: this.minLong+(x/this.meterRate)*(this.maxLong-this.minLong)/this.longDistance,
			lat: this.minLat+((this.map.h-y)/this.meterRate)*(this.maxLat-this.minLat)/this.latDistance
		};
	},


	/*************************** DRAW ****************************/


	drawDemo: function() {
		var seg, i, n, key, type, len;
		for(i=0; i<this.segment.length; i++){
			seg = this.segment[i];
			poly = [];
			for(n=0, len = seg.length; n<len; n++) {
				poly.push(this.getPoint(seg[n]));
			}
			path = this.draw.polyline(poly);
			this.drawGroup.add(path);
			path.fill('none').stroke({ width: 1, color: 'green', dasharray: '10, 4'});
		}
	}
};