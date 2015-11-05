;(function() {
	SVG.extend(SVG.Container, {
		dragstart: function() {			
			if(!this.lastGestureTime || new Date().getTime() - this.lastGestureTime > 500) {
				this.dragStartMatrix = this._matrix();
			}
		},
		drag: function(dx, dy) {
			if(this.dragStartMatrix) {
				this.m = this.dragStartMatrix;
				this.mTranslate(dx, dy).mCommit();
			}
		},
		transformstart: function (cx, cy) {
			this.dragStartMatrix = null;
			this.transformStartMatrix = this._matrix();
			this.gestureLocal = {
				x: cx,
				y: cy
			};
		},
		pinchRotate: function (scale, angle) {
			this.lastGestureTime = new Date().getTime();
			this.dragStartMatrix = null;
			if(this.transformStartMatrix) {
				this.m = this.transformStartMatrix;
				this.mTransform({
					center: this.gestureLocal,
					scale: scale,
					rotate: angle
				});
			}
		},
		mFlush: function() {
			this.m = null;
			return this;
		},
		mCommit: function() {
			var transform = this.getSVG().createSVGTransformFromMatrix(this.m);
			this.node.transform.baseVal.initialize(transform);
			return this.mFlush();
		},
		mTransform: function(c) {
			c.translate && this.mTranslate(c.translate.x, c.translate.y);
			c.center && this.mTranslate(-c.center.x, -c.center.y);
			c.scale && this.mScale(c.scale);
			c.rotate && this.mRotate(c.rotate);
			c.center && this.mTranslate(c.center.x, c.center.y);			
			return this.mCommit();
		},
		mScale: function(scale) {
			return this._mult(this.getSVG().createSVGMatrix().scale(scale));
		},
		mRotate: function(angle) {
			return this._mult(this.getSVG().createSVGMatrix().rotate(angle));
		},
		mTranslate: function(dx, dy) {
			return this._mult(this.getSVG().createSVGMatrix().translate(dx, dy));
		},
		getSVG: function() {
			return this.node.ownerSVGElement;
		},		
		decomposeMatrix: function() {
			var matrix = this._matrix();
			function deltaTransformPoint(x, y)  {
		        var dx = x * matrix.a + y * matrix.c + 0,
		        	dy = x * matrix.b + y * matrix.d + 0;
		        return { x: dx, y: dy };
		    };
	        var px = deltaTransformPoint(0, 1),
	        	py = deltaTransformPoint(1, 0),
	        	skewX = ((180 / Math.PI) * Math.atan2(px.y, px.x) - 90),
	        	skewY = ((180 / Math.PI) * Math.atan2(py.y, py.x));
	        return {
	            translateX: matrix.e,
	            translateY: matrix.f,
	            scaleX: Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
	            scaleY: Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d),
	            skewX: skewX,
	            skewY: skewY,
	            rotation: skewX // rotation is the same as skew x
	        };        
	    },
		_matrix: function() {
			return this.m ? this.m : this.node.getCTM();
		},
		_mult: function(matrix) {
			this.m = matrix.multiply(this._matrix());
			return this;
		}
	});
}).call(this);
