(function(){

	var map;
	var service;

	//Trims a url of http/s:// and trailing slashes
	function cleanUpUrl(url) {
		url = url.replace(/^https?\:\/\//i, '');
		url = url.replace(/\/$/, '');
		return url;
	}

	//Filters for querying Google Places and sorting results
	var filters = [
		{
			text: 'Eat',
			googleType: ['restaurant'],
			list: [],
		},
		{
			text: 'Drink',
			googleType: ['bar'],
			list: [],
		}
	];

	//Object reperesenting sources for different marker icons used
	var markerIcons = {
		normal: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
		highlight: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
	}

	/* Represents a place that matches a type in the filters object (currently
	 a restaurant or bar).  Takes a Google PlaceResult object */
	var Place = function(place) {
		var self = this;

		self.id = ko.observable(place.place_id);
		self.name = ko.observable(place.name);
		self.location = ko.observable(place.geometry.location);
		self.address = ko.observable(place.vicinity);
		self.types = ko.observableArray(place.types);
		self.price = ko.observable(place.price_level);
		self.rating = ko.observable(place.rating);
		self.url = ko.observable('');

		self.infoWindowContent = ko.computed(function() {
			var header = '<h3 class=info-title>' + self.name() + '</h3>';
			var splitAddress = self.address().split(',');
			var formattedAddress = '<p>' + splitAddress[0] + '</p><p>' + splitAddress[1] + ', IL</p>';
			var url = '<a data-bind="url" href="' + self.url() + '">' + cleanUpUrl(self.url()) + '</a>';

			return '<div class="info-content">' + header + formattedAddress + url + '</div>';
		});

		//convert price level to $$$
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
				marker = new google.maps.Marker({
					position: self.location(),
					title: self.name(),
					icon: markerIcons.normal,
				});
			}

			return marker;
		})(self);

		self.clearMarker = function() {
			self.marker.setMap(null);
		}

		self.showMarker = function() {
			self.marker.setMap(map);
		}
	}

	//Main ViewModel
	var ViewModel = function() {
		var self = this;

		//Private properties
		
		//location variables
		var hydeParkCenter = new google.maps.LatLng(41.7948539, -87.5951525);

		var hydeParkBounds = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787713, -87.606008),
			new google.maps.LatLng(41.802655, -87.579486));

		var uChicagoCampus = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787688, -87.606030),
			new google.maps.LatLng(41.794243, -87.596653));


		//Google Maps Info Window object
		var infoWindow = new google.maps.InfoWindow();
		
		//Holds list of results from Google Places API.
		var rawPlacesList = [];
		
		/* List of functions testing place eligibility.
		   Each function must return true for a place to be eligible */
		var requirements = {
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
		
		//KnockoutJS Observables

		/* List of filters, filterList[i].text bound to '.filters'
		   filterList[i].list bound to '.places */
		self.filterList = ko.observableArray(filters);		

		//Bound to CSS class '.selected'
		self.currentFilter = ko.observable(self.filterList()[0]);
		self.currentPlace = ko.observable();

		//Bound to '.error-status'
		self.errorCode = ko.observable();

		//Determines visibility of '.error'
		self.showError = ko.observable(false);

		//Methods

		//hides error message
		self.hideError = function() {
			self.showError(false);
		}

		//Sets the selected filter as the current active filter and displays markers
		self.setCurrentFilter = function(filter) {
			
			//clear markers from the previous currentFilter
			self.currentFilter().list.forEach(function(place) {
					place.clearMarker();
			});

			self.currentFilter(filter);

			//show the markers for the current list
			self.currentFilter().list.forEach(function(place) {
				place.showMarker();
			});

		};

		//Sets the currently selected place and highlight's its marker
		self.setCurrentPlace = function(place) {

			if(place) {
				highlightMarker(place);
				self.currentPlace(place);
				openInfoWindow();				
			}
		};

		//Private functions

		//Initialize map
		function initMap() {
			map = new google.maps.Map(document.getElementById('map'), {
				center: hydeParkCenter,
				zoom: 15,

				//controls
				mapTypeControl: false,
				streetViewControl: false,
			});

			//request places
			request();
		};

		//Prepares a request for Google Places based on the filter passed and calls that request
		function request() {

			//Emply places list
			if(rawPlacesList.length) {
				rawPlacesList = [];				
			}

			//Get all types from filters
			var types = []
			self.filterList().forEach(function(filter){
				types = types.concat(filter.googleType);
			});
	
			//format request object
			var request = {
				bounds: hydeParkBounds,
				types: types,
			};

			//call Google
			service = new google.maps.places.PlacesService(map);

			//Results are passed to processPlaces()
			service.nearbySearch(request, processPlaces);	
		};

		
		/* Iterates results from Google Places and fills an Observable Array with places
		   that pass tests outlines in self.requirements, above.
		   Finally, calls sortPlaces to sort into lists based on type */
		function processPlaces(results, status, pagination) {
			if(status = google.maps.places.PlacesServiceStatus.OK) {

				results.forEach(function(result){

					//Test place eligibility against functions in requirements
					var eligible = true;
					for(var test in requirements) {
						if(!requirements[test](result)) {
							eligible = false;
						}
					}

					if(eligible) {
						// console.log(result);
						rawPlacesList.push(new Place(result));	
					}
				});

				if(pagination.hasNextPage) {
					pagination.nextPage();
				}

				addMarkerListeners();
				sortPlaces();
				self.setCurrentFilter(self.currentFilter());

			} else {
				self.errorCode(status);
				self.showError(true);
			}

		};

		//Sorts places from rawPlacesList into lists based on type in the filter objects
		function sortPlaces() {
			self.filterList().forEach(function(filter) {
				rawPlacesList.forEach(function(place) {
					for(var i = 0; i < filter.googleType.length; i++) {
						var type = filter.googleType[i];
						
						//place has filter type and isn't a duplicate
						if(place.types.indexOf(type) > -1 && filter.list.indexOf(place) == -1) {
							filter.list.push(place);
						}
					}
				});

				//Sort each list by rating
				filter.list.sort(function(a,b) {					
					if(a.rating() > b.rating()) {						
						return -1;
					} else if(a.rating() == b.rating()) {
						return 0;
					} else {
						return 1;
					}
				});
			});		
		}

		//Adds click listeners to each returned place's marker
		function addMarkerListeners() {
			rawPlacesList.forEach(function(place) {
				google.maps.event.addListener(place.marker, 'click', function () {
              		self.setCurrentPlace(place);
            	});
			})
		}

		//Highlight current marker, unhighlights old
		function highlightMarker(place) {
			//Reset the previously selected place's marker
			if(self.currentPlace() && place != self.currentPlace()) {
				self.currentPlace().marker.setIcon(markerIcons.normal);
				self.currentPlace().marker.setZIndex();				
			}
			place.marker.setIcon(markerIcons.highlight);			
			place.marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
			
		};

		//Open the infoWindow with the info from the currentPlace
		function openInfoWindow() {

			//Only call the API if the current place's url isn't set.
			if(!self.currentPlace().url()) {
				var request = {
					placeId: self.currentPlace().id(),
				}
				//Query the API and call fillDetails, which sets the url if one returned.
				service.getDetails(request, fillDetails);
				
				//If the place already has a URL, just open the window
			} else {
				infoWindow.setContent(self.currentPlace().infoWindowContent());
				infoWindow.open(map, self.currentPlace().marker);				
			}
		};

		//Processes Google Place Details result, sets the currentPlace's url
		function fillDetails(result, status) {
			if(status == google.maps.places.PlacesServiceStatus.OK) {
				
				if(result.website) {
					self.currentPlace().url(result.website);
				} else {
					self.currentPlace().url(' ');
				}

				//set infoWindow content and open
				infoWindow.setContent(self.currentPlace().infoWindowContent());
				infoWindow.open(map, self.currentPlace().marker);				

			} else {
				self.errorCode(status);
				self.showError(true);
			}
		}

		//Initialize map and make Google Places request
		google.maps.event.addDomListener(window, 'load', initMap);		
	};

	ko.applyBindings(new ViewModel());

})();