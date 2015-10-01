//TODO - 
//order by rating
//add error handling should goodle map api be down or not connecting
//open info window on click
//data validation --in case of no pricing info or rating, put a message

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

		//move this
		self.highlightIcon = 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
		self.defaultIcon = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'

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
					icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
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


	var ViewModel = function() {
		var self = this;

		//location variables
		var hydeParkCenter = new google.maps.LatLng(41.7948539, -87.5951525);

		var hydeParkBounds = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787713, -87.606008),
			new google.maps.LatLng(41.802655, -87.579486));

		var uChicagoCampus = new google.maps.LatLngBounds(
			new google.maps.LatLng(41.787688, -87.606030),
			new google.maps.LatLng(41.794243, -87.596653));


		var infoWindow = new google.maps.InfoWindow();
		
		//initialize defaults

		/* List of filters, filterList[i].text bound to '.filters'
		   filterList[i].list bound to '.places */
		self.filterList = ko.observableArray(filters);		
		
		//List of results from Google Places API. Not used in view
		self.rawPlacesList = ko.observableArray([]);

		//Bound to CSS class '.selected'
		self.currentFilter = ko.observable(self.filterList()[0]);
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

		//Prepares a request for Google Places based on the filter passed and calls that request
		self.request = function() {

			//Emply places list
			if(self.rawPlacesList.length) {
				self.rawPlacesList([]);				
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

			//Results are passed to self.processPlaces()
			service.nearbySearch(request, self.processPlaces);	
		};

		
		/* Iterates results from Google Places and fills an Observable Array with places
		   that pass tests outlines in self.requirements, above.
		   Finally, calls sortPlaces to sort into lists based on type */
		self.processPlaces = function(results, status, pagination) {
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
						self.rawPlacesList.push(new Place(result));	
					}
				});

				if(pagination.hasNextPage) {
					pagination.nextPage();
				}
				self.sortPlaces();
				self.setCurrentFilter(self.currentFilter());

			} else {
				console.log('Error: ' + status);
			}

		};

		//Sorts places from rawPlacesList into lists based on type in the filter objects
		self.sortPlaces = function() {
			self.filterList().forEach(function(filter) {
				self.rawPlacesList().forEach(function(place) {
					for(var i = 0; i < filter.googleType.length; i++) {
						var type = filter.googleType[i];
						
						//place has filter type and isn't a duplicate
						if(place.types.indexOf(type) > -1 && filter.list.indexOf(place) == -1) {
							filter.list.push(place);
						}
					}
				});
			});		
		}

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

		//Sets the currently selected place and highlight's its marker
		self.setCurrentPlace = function(place) {
			if(place) {
				self.highlightMarker(place);
				self.currentPlace(place);
				self.openInfoWindow();				
			}
		};

		//Highlight current marker, unhighlights old
		self.highlightMarker = function(place) {
			if(self.currentPlace() && place != self.currentPlace()) {
				self.currentPlace().marker.setIcon(self.currentPlace().defaultIcon);
				self.currentPlace().marker.setZIndex();				
			}
			place.marker.setIcon(place.highlightIcon);			
			place.marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
			
		};

		//Open the infoWindow with the info from the currentPlace
		self.openInfoWindow = function() {

			//Only call the API if the current place's url isn't set.
			if(!self.currentPlace().url()) {
				var request = {
					placeId: self.currentPlace().id(),
				}
				//Query the API and call fillDetails, which sets the url if one.
				service.getDetails(request, self.fillDetails);
				
				//If the place already has a URL, just open the window
			} else {
				infoWindow.setContent(self.currentPlace().infoWindowContent());
				infoWindow.open(map, self.currentPlace().marker);				
			}
		};

		//Processes Google Place Details result, sets the currentPlace's url
		self.fillDetails = function(result, status) {
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
				console.log('error ' + status);
			}
		}

		//Initialize map and make Google Places request
		self.initMap();
		self.request();
		
	};


	ko.applyBindings(new ViewModel());


})();