//TODO - 
//order by rating
//add error handling should goodle map api be down or not connecting
//show tooltip with info when list item clicked
//data validation --in case of no pricing info or rating, put a message

(function(){

	var map;
	var service;

	var Place = function(place) {
		var self = this;

		self.id = ko.observable(place.place_id);
		self.name = ko.observable(place.name);
		self.location = ko.observable(place.geometry.location);
		self.address = ko.observable(place.vicinity);
		self.types = ko.observableArray(place.types);
		self.price = ko.observable(place.price_level);
		self.rating = ko.observable(place.rating);

		self.infoWindowContent = ko.computed(function() {
			var header = '<h3 class=info-title>' + self.name() + '</h3>';
			var splitAddress = self.address().split(',');
			var formattedAddress = '<p>' + splitAddress[0] + '</p><p>' + splitAddress[1] + ', IL</p>';

			return '<div class="info-content">' + header + formattedAddress + '</div>';
		});

		//move this
		self.highlightIcon = 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
		self.defaultIcon = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'

		self.price = (function(self) {
			var price = '';
			for(var i = 0; i < self.price(); i++ ) {
				price += '$';
			}
			return price;
		})(self);

		self.marker = (function(self) {
			var marker;

			if(self.location()) {
				// console.log(self);
				marker = new google.maps.Marker({
					position: self.location(),
					map: map,
					title: self.name() + '' + self.types(),
					icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
				});
			}

			return marker;
		})(self);

		self.clearMarker = function() {
			self.marker.setMap(null);
		}
	}


	var ViewModel = function() {
		var self = this;

		//location variables
		var hydeParkCenter = new google.maps.LatLng(41.7948539, -87.5951525);

		var hydeParkBounds = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787713, -87.606008),
			new google.maps.LatLng(41.802655, -87.579486));

		var uChicagoCampus = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787688, -87.606030),
			new google.maps.LatLng(41.794887, -87.596653));


		//initialize defaults
		var infoWindow = new google.maps.InfoWindow();

		//List of filters and their google type keyword counterparts
		self.filterList = ko.observableArray([
			{
				text: 'Eat',
				googleType: ['restaurant'],
			},
			{
				text: 'Drink',
				googleType: ['bar'],
			}
			]);

		self.currentFilter = ko.observable(self.filterList()[0]);
		self.placesList = ko.observableArray([]);
		self.currentPlace = ko.observable();

		/* Functions testing place eligibility.
		   Each function must return true for a place to be eligible */
		self.requirements = {
			//return true if NOT on uChicago campus
			notOnCampus: function(place) {
				return !uChicagoCampus.contains(place.geometry.location);
			},

			//return true if has a rating
			hasRating: function(place) {
				if(place.rating) {
					return true;
				} else {
					return false;
				}
			},

			//return true if none of the banned types appear in a place's types array
			isNotType: function(place) {
				var bannedTypes = ['meal_takeaway'];
				return bannedTypes.every(function(type) {
					return place.types.indexOf(type) == -1;
				});
			}
		}

		//Prepares a request for Google Places based on the filter passed and calls that request
		self.request = function(filter) {
			//Clear markers on request
			self.placesList().forEach(function(place) {
				place.clearMarker();
			});

			//Emply places list
			self.placesList([]);

			//Set filter as current
			self.currentFilter(filter);

			var request = {
				bounds: hydeParkBounds,
				types: filter.googleType,
			};

			service = new google.maps.places.PlacesService(map);

			//Results are passed to self.listPlaces()
			service.nearbySearch(request, self.listPlaces);	
		};
		
		/* Iterates results from Google Places and fills an Observable Array with places
		   that pass tests outlines in self.requirements, above */
		self.listPlaces = function(results, status, pagination) {
			if(status = google.maps.places.PlacesServiceStatus.OK) {

				results.forEach(function(result){

					//Test place eligibility against functions in self.requirements
					var eligible = true;
					for(var test in self.requirements) {
						if(!self.requirements[test](result)) {
							eligible = false;
						}
					}

					if(eligible) {
						// console.log(result);
						self.placesList.push(new Place(result));	
					}
				});

				if(pagination.hasNextPage) {
					pagination.nextPage();
				}
			} else {
				console.log('Error: ' + status);
			}
		};

		//Initialize map
		self.initMap = function() {
			var self = this;
			map = new google.maps.Map(document.getElementById('map'), {
				center: hydeParkCenter,
				zoom: 15,

				//controls
				mapTypeControl: false,
				streetViewControl: false,
				zoomControl: false

			});
		};

		//Sets the currently selected place and highlight's it's marker
		self.setCurrent = function(place) {
			self.highlightMarker(place);
			self.currentPlace(place);
			self.openInfoWindow(place);
		};

		//Highlight current marker, unhighlights old
		self.highlightMarker = function(place) {
			console.log(place.marker.zIndex);
			if(self.currentPlace() && place != self.currentPlace()) {
				self.currentPlace().marker.setIcon(self.currentPlace().defaultIcon);
				self.currentPlace().marker.setZIndex();				
			}
			place.marker.setIcon(place.highlightIcon);			
			place.marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
			
		};

		self.openInfoWindow = function(place) {
			infoWindow.setContent(place.infoWindowContent());
			infoWindow.open(map, place.marker);
		};

		self.initMap();
		self.request(self.currentFilter());
	};

	ko.applyBindings(new ViewModel());


})();