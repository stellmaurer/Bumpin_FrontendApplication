/*******************************************************
 * Copyright (C) 2018 Stephen Ellmaurer <stellmaurer@gmail.com>
 * 
 * This file is part of the Bumpin mobile app project.
 * 
 * The Bumpin project and any of the files within the Bumpin
 * project can not be copied and/or distributed without
 * the express permission of Stephen Ellmaurer.
 *******************************************************/

import { Component, ViewChild, ElementRef } from '@angular/core';
import { NavController, Events } from 'ionic-angular';
import { Geolocation } from 'ionic-native';
import { Http } from '@angular/http';
import { Party } from "../../model/party";
import { Bar } from "../../model/bar";
import { AllMyData } from "../../model/allMyData";
import { PopoverController } from 'ionic-angular';
import { PartyPopover } from './partyPopover';
import { BarPopover } from './barPopover';
import { LocationTracker } from '../../providers/location-tracker';
import { Utility } from '../../model/utility';
import { AlertController } from 'ionic-angular';
import { Login } from '../login/login';
import * as MarkerClusterer from 'node-js-marker-clusterer';
import { Storage } from '@ionic/storage';
 
declare var google;

@Component({
  selector: 'page-find',
  templateUrl: 'find.html'
})
export class FindPage {

  private bumpinMarker = "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=|32DB64";
  private heatingUpMarker = "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=|FFFF00";
  private decentMarker = "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=|FFA500";
  private weakMarker = "http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=|F53D3D";
 
  private tabName: string = "Find Tab";
  @ViewChild('map') mapElement: ElementRef;
  public map: any;

  private markerCluster : any;
  private barClusterMarkers : any;
  partyMarkersOnMap : Map<string,any>;
  barMarkersOnMap : Map<string,any>;

  userLocationMarker: any;
  myCoordinates : any;

  geocoder : any;

  private barFilterDontShowBars : boolean;
  private barFilterAttendance : boolean;
  private barFilterAvgRating : boolean;
  private barFilterMoreWomen : boolean;
  private barFilterMoreMen : boolean;
  private barFilterFriendsPresent : boolean;
  private barFilterDontShowBarsTemp : boolean;
  private barFilterAttendanceTemp : boolean;
  private barFilterAvgRatingTemp : boolean;
  private barFilterMoreWomenTemp : boolean;
  private barFilterMoreMenTemp : boolean;
  private barFilterFriendsPresentTemp : boolean;

  private partyFilterAnyToday : boolean;
  private partyFilterAnyThisWeek : boolean;
  private partyFilterDontShowParties : boolean;
  private partyFilterAnyTodayTemp : boolean;
  private partyFilterAnyThisWeekTemp : boolean;
  private partyFilterDontShowPartiesTemp : boolean;
 
  constructor(private storage: Storage, private allMyData : AllMyData, private login : Login, public alertCtrl: AlertController, public locationTracker: LocationTracker, private events : Events, private http:Http, public navCtrl: NavController, public popoverCtrl: PopoverController) {
    this.allMyData.events = events;
    this.partyMarkersOnMap = new Map<string,any>();
    this.barMarkersOnMap = new Map<string,any>();
    this.locationTracker.startTracking();

    this.partyFilterAnyToday = false;
    this.partyFilterAnyThisWeek = false;
    this.partyFilterDontShowParties = false;
    this.partyFilterAnyTodayTemp = false;
    this.partyFilterAnyThisWeekTemp = false;
    this.partyFilterDontShowPartiesTemp = false;

    this.barFilterDontShowBars = false;
    this.barFilterAttendance = false;
    this.barFilterAvgRating = false;
    this.barFilterMoreWomen = false;
    this.barFilterMoreMen = false;
    this.barFilterFriendsPresent = false;
    this.barFilterDontShowBarsTemp = false;
    this.barFilterAttendanceTemp = false;
    this.barFilterAvgRatingTemp = false;
    this.barFilterMoreWomenTemp = false;
    this.barFilterMoreMenTemp = false;
    this.barFilterFriendsPresentTemp = false;

    this.barClusterMarkers = new Array<any>();
  }

  ionViewDidLoad(){
    this.login.login()
    .then((res) => {
      this.setupThePage();
    })
    .catch((err) => {
        // error logging is already done in the Login file
    });
  }

  ionViewWillEnter(){
    this.allMyData.events.publish("timeToRefreshPartyAndBarData");
  }

  private setupThePage(){
    this.loadMap()
    .then((res) => {
      // Start retrieving user location
      this.enableUserLocation();
      // Get bars that are close to me from the database
      this.allMyData.refreshBarsCloseToMe(this.myCoordinates,this.http)
      .then((res) => {
        this.events.publish("updateMyAtBarAndAtPartyStatuses");
        this.refreshBarMarkers();
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshBarsCloseToMe query error : Err msg = " + err, this.http);
      });

      this.allMyData.refreshBarsImHosting(this.http)
      .then((res) => {
        this.events.publish("updateMyAtBarAndAtPartyStatuses");
        this.refreshBarMarkers();
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshBarsImHosting query error : Err msg = " + err, this.http);
      });

      // Get parties that I'm invited to from the database
      this.allMyData.refreshParties(this.http)
      .then((res) => {
        this.events.publish("updateMyAtBarAndAtPartyStatuses");
        this.refreshPartyMarkers();
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshParties query error : Err msg = " + err, this.http);
      });
    })
    .catch((err) => {
      this.allMyData.logError(this.tabName, "google maps", "issue loading the google map : Err msg = " + err, this.http);
    });

    this.allMyData.refreshPerson(this.http)
    .then((res) => {
      this.allMyData.refreshPartiesImHosting(this.http)
      .then((res) => {
        
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshPartiesImHosting query error : Err msg = " + err, this.http);
      });
    })
    .catch((err) => {
      this.allMyData.logError(this.tabName, "server", "refreshPerson query error : Err msg = " + err, this.http);
    });

    this.allMyData.startPeriodicDataRetrieval(this.http);
    this.events.subscribe("timeToRefreshPartyAndBarData",() => {
      this.allMyData.refreshPerson(this.http)
      .then((res) => {
        Promise.all([this.allMyData.refreshBarsCloseToMe(this.myCoordinates, this.http), this.allMyData.refreshBarsImHosting(this.http), this.allMyData.refreshParties(this.http)]).then(thePromise => {
          return thePromise;
        })
        .then((res) => {
          this.events.publish("updateMyAtBarAndAtPartyStatuses");
          this.refreshPartyMarkers();
          this.refreshBarMarkers();
          this.updateMyGoingOutStatusIfNeeded();
        })
        .catch((err) => {
          this.allMyData.logError(this.tabName, "server", "refreshBarsCloseToMe or refreshParties query error : Err msg = " + err, this.http);
        });
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshPerson query error : Err msg = " + err, this.http);
      });
    });

    this.events.subscribe("aDifferentUserJustLoggedIn",() => {
      Promise.all([this.allMyData.refreshBarsCloseToMe(this.myCoordinates, this.http), this.allMyData.refreshBarsImHosting(this.http), this.allMyData.refreshParties(this.http)]).then(thePromise => {
        return thePromise;
      })
      .then((res) => {
        this.refreshPartyMarkers();
        this.refreshBarMarkers();
      })
      .catch((err) => {
        this.allMyData.logError(this.tabName, "server", "refreshBarsCloseToMe or refreshParties query error : Err msg = " + err, this.http);
      });
    });

    this.events.subscribe("timeToUpdateUI",() => {
        this.updateTheUI();
    });

    this.events.subscribe("timeToRefreshMapMarkers",() => {
      this.refreshMapMarkers();
    });
  }

  private updateTheUI(){
    for(let i = 0; i < this.allMyData.invitedTo.length; i++){
      this.allMyData.invitedTo[i].refreshPartyStats();
    }
    for(let i = 0; i < this.allMyData.barsCloseToMe.length; i++){
      this.allMyData.barsCloseToMe[i].refreshBarStats();
    }
    this.refreshMapMarkers();
  }

  private refreshMapMarkers(){
    this.refreshPartyMarkers();
    this.refreshBarMarkers();
  }

  private enableUserLocation(){
    this.locationTracker.watch
      .subscribe((location) => {
        this.myCoordinates = {lat: this.locationTracker.lat, lng: this.locationTracker.lng};
        this.userLocationMarker.setPosition(this.myCoordinates);
    });
  }
 
  private loadMap(){
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition().then((position) => {
        this.myCoordinates = {lat: position.coords.latitude, lng: position.coords.longitude};
        let latLng = {lat: position.coords.latitude, lng: position.coords.longitude};
  
        let mapOptions = {
          center: latLng,
          zoom: 15,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        }
        
        this.map = new google.maps.Map(this.mapElement.nativeElement, mapOptions);
        let image = 'assets/greencircle.png';
        this.userLocationMarker = new google.maps.Marker({
          map: this.map,
          position: {lat: position.coords.latitude, lng: position.coords.longitude},
          icon: image
        });
        this.markerCluster = new MarkerClusterer(this.map, [], {imagePath: 'assets/m', maxZoom: 12});
        resolve("the google map has loaded");
      }, (err) => {
        // User probably didn't allow the app permission to access their location
        this.myCoordinates = {lat: 40.082064, lng: -97.390820};
        let latLng = {lat: 40.082064, lng: -97.390820};

        let mapOptions = {
          center: latLng,
          zoom: 3,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        }
        
        this.map = new google.maps.Map(this.mapElement.nativeElement, mapOptions);

        this.markerCluster = new MarkerClusterer(this.map, [], {imagePath: 'assets/m', maxZoom: 12});
        resolve("the google map has loaded after an error: " + err + 
        ". This probably was caused by the user not allowing the app to use their location.");
      });
    });
  }

  /*
    First, we need to cleanup any parties that are on the map but are no longer in allMyData.invitedTo.
        This is handled by Case 1.
    All markers can't just be cleared and then re-added because that will interrupt users who
        are interacting with the map. We instead need to check to see if a party already exists
        on the map and update it if it exists, otherwise just add it to the map.
        This is handled by Case 1 and 2.

    Case 1 : cleanup old parties
    Case 2 : this party is on the map
    Case 3 : this party isn't on the map
  */
  private refreshPartyMarkers(){
    var thisInstance = this;
    // Transform party array into a hashmap for quick access in Case 1
    var parties = this.allMyData.invitedTo;
    var partiesMap : Map<string,Party> = new Map<string,Party>();
    for(let i = 0; i < parties.length; i++){
      partiesMap.set(parties[i].partyID, parties[i]);
    }

    // Case 1 : cleanup parties that are on the map but are no longer in allMyData.invitedTo
    this.partyMarkersOnMap.forEach((value: any, key: string) => {
      if(partiesMap.has(key) == false){
        let theMarkerToRemove = this.partyMarkersOnMap.get(key);
        theMarkerToRemove.setMap(null);
        this.partyMarkersOnMap.delete(key);
      }
    });

    // Case 2 and 3
    partiesMap.forEach((value: Party, key: string) => {
      let marker : any;
      // Case 2 : this party is on the map
      if(this.partyMarkersOnMap.has(key) == true){
        marker = this.partyMarkersOnMap.get(key);
        // the party might have new myCoordinates
        var coordinates = {lat: value.latitude, lng: value.longitude};
        marker.setPosition(coordinates);
        marker.setIcon(this.getMarkerIcon(value));
        marker.party = value;
        marker.setLabel(String(value.numberOfPeopleAtParty));
      }
      // Case 3 : this party isn't on the map
      else{
        marker = new google.maps.Marker({
          map: this.map,
          animation: google.maps.Animation.DROP,
          position: {lat: value.latitude, lng: value.longitude},
          icon : this.getMarkerIcon(value),
          label : String(value.numberOfPeopleAtParty),
          party : value
        });
        marker.addListener('click', function() {
          thisInstance.presentPartyPopover(this.party);
        });
      }
      this.partyMarkersOnMap.set(key, marker); // update the party markers list with the new party info
    });

    this.updateMapMarkersVisibility();
  }

  /*
    First, we need to cleanup any bars that are on the map but are no longer in allMyData.invitedTo.
        This is handled by Case 1.
    All markers can't just be cleared and then re-added because that will interrupt users who
        are interacting with the map. We instead need to check to see if a bar already exists
        on the map and update it if it exists, otherwise just add it to the map.
        This is handled by Case 1 and 2.

    Case 1 : cleanup old bars
    Case 2 : this bar is on the map
    Case 3 : this bar isn't on the map
  */
  private refreshBarMarkers(){
    var thisInstance = this;
    // Transform bar array into a hashmap for quick access in Case 1
    var bars = this.allMyData.barsCloseToMe;
    var barsMap : Map<string,Bar> = new Map<string,Bar>();
    for(let i = 0; i < bars.length; i++){
      barsMap.set(bars[i].barID, bars[i]);
    }
    bars = this.allMyData.barHostFor;
    for(let i = 0; i < bars.length; i++){
      barsMap.set(bars[i].barID, bars[i]);
    }

    // Case 1 : cleanup bars that are on the map but are no longer in allMyData.invitedTo
    this.barMarkersOnMap.forEach((value: any, key: string) => {
      if(barsMap.has(key) == false){
        let theMarkerToRemove = this.barMarkersOnMap.get(key);
        theMarkerToRemove.setMap(null);
        this.barMarkersOnMap.delete(key);
      }
    });

    // Case 2 and 3
    barsMap.forEach((value: Bar, key: string) => {
      let marker : any;
      // Case 2 : this bar is on the map
      if(this.barMarkersOnMap.has(key) == true){
        marker = this.barMarkersOnMap.get(key);
        // the bar might have new myCoordinates
        let coordinates = {lat: value.latitude, lng: value.longitude};
        marker.setPosition(coordinates);
        marker.setIcon(this.getMarkerIcon(value));
        marker.setLabel(String(value.numberOfPeopleAtBar));
        marker.bar = value;
      }
      // Case 3 : this bar isn't on the map
      else{
        marker = new google.maps.Marker({
          map: null, // need to set the map to null here because the marker clusterer takes care of that
          animation: google.maps.Animation.DROP,
          position: {lat: value.latitude, lng: value.longitude},
          icon : this.getMarkerIcon(value),
          label: String(value.numberOfPeopleAtBar),
          bar : value
        });
        marker.addListener('click', function() {
          thisInstance.presentBarPopover(this.bar);
        });
      }
      this.barMarkersOnMap.set(key, marker); // update the bar markers list with the new bar info
    });

    /*
    this.barClusterMarkers = new Array<any>();
    this.barMarkersOnMap.forEach((value: any, key: string) => {
      let theMarkerToHide = this.barMarkersOnMap.get(key);
      theMarkerToHide.setMap(null);
      this.barClusterMarkers.push(theMarkerToHide);
    });
    this.markerCluster.clearMarkers();
    this.markerCluster.addMarkers(this.barClusterMarkers);
    */
    this.updateMapMarkersVisibility();
  }

  private getMarkerIcon(partyOrBar: any): any{
    let iconURL = this.bumpinMarker;
    if(partyOrBar.averageRating == "Heat'n-up"){
      iconURL = this.heatingUpMarker;
    }
    if(partyOrBar.averageRating == "Decent"){
      iconURL = this.decentMarker;
    }
    if(partyOrBar.averageRating == "Weak"){
      iconURL = this.weakMarker;
    }
    let markerIcon = {
      url: iconURL,
      labelOrigin: new google.maps.Point(10,11)
    };
    return markerIcon;
  }

  private presentPartyPopover(party : Party) {
    let popover = this.popoverCtrl.create(PartyPopover, {party:party, allMyData:this.allMyData, http:this.http, navCtrl:this.navCtrl}, {cssClass:'partyPopover.scss'});
    popover.present();
  }

  private presentBarPopover(bar : Bar) {
    let popover = this.popoverCtrl.create(BarPopover, {bar:bar, allMyData:this.allMyData, http:this.http}, {cssClass:'barPopover.scss'});
    popover.present();
  }

  presentPartyFilterAlert() {
    let alert = this.alertCtrl.create();
    alert.setTitle('How do you want to filter parties? (filters are subtractive)');

    alert.addInput({
      type: 'checkbox',
      label: "Don't show any parties",
      checked: this.partyFilterDontShowParties,
      handler: data =>  { this.partyFilterDontShowPartiesTemp = !this.partyFilterDontShowPartiesTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Any this week',
      checked: this.partyFilterAnyThisWeek,
      handler: data =>  { this.partyFilterAnyThisWeekTemp = !this.partyFilterAnyThisWeekTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Any today',
      checked: this.partyFilterAnyToday,
      handler: data =>  { this.partyFilterAnyTodayTemp = !this.partyFilterAnyTodayTemp;}
    });

    alert.addButton({
      text: 'Cancel',
      handler: data => {
        this.partyFilterDontShowPartiesTemp = this.partyFilterDontShowParties;
        this.partyFilterAnyThisWeekTemp = this.partyFilterAnyThisWeek;
        this.partyFilterAnyTodayTemp = this.partyFilterAnyToday;
      }
    });
    alert.addButton({
      text: 'Okay',
      handler: data => {
        this.partyFilterDontShowParties = this.partyFilterDontShowPartiesTemp;
        this.partyFilterAnyThisWeek = this.partyFilterAnyThisWeekTemp;
        this.partyFilterAnyToday = this.partyFilterAnyTodayTemp;
        this.updateMapMarkersVisibility();
      }
    });
    alert.present();
  }

  presentBarFilterAlert() {
    let alert = this.alertCtrl.create();
    alert.setTitle('How do you want to filter bars? (filters are subtractive)');

    alert.addInput({
      type: 'checkbox',
      label: "Don't show any bars",
      checked: this.barFilterDontShowBars,
      handler: data =>  { this.barFilterDontShowBarsTemp = !this.barFilterDontShowBarsTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Attendance >= 1',
      checked: this.barFilterAttendance,
      handler: data =>  { this.barFilterAttendanceTemp = !this.barFilterAttendanceTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Avg rating >= Decent',
      checked: this.barFilterAvgRating,
      handler: data =>  { this.barFilterAvgRatingTemp = !this.barFilterAvgRatingTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'More women than men',
      checked: this.barFilterMoreWomen,
      handler: data =>  { this.barFilterMoreWomenTemp = !this.barFilterMoreWomenTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'More men than women',
      checked: this.barFilterMoreMen,
      handler: data =>  { this.barFilterMoreMenTemp = !this.barFilterMoreMenTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Friends present',
      checked: this.barFilterFriendsPresent,
      handler: data =>  { this.barFilterFriendsPresentTemp = !this.barFilterFriendsPresentTemp;}
    });

    /*
    alert.addInput({
      type: 'checkbox',
      label: 'Bars without a line',
      checked: this.includeBars,
      handler: data =>  { this.includeBarsTemp = !this.includeBarsTemp;}
    });
    alert.addInput({
      type: 'checkbox',
      label: 'Bars without a line',
      checked: this.includeBars,
      handler: data =>  { this.includeBarsTemp = !this.includeBarsTemp;}
    });
    */


    alert.addButton({
      text: 'Cancel',
      handler: data => {
        this.barFilterDontShowBarsTemp = this.barFilterDontShowBars;
        this.barFilterAttendanceTemp = this.barFilterAttendance;
        this.barFilterAvgRatingTemp = this.barFilterAvgRating;
        this.barFilterMoreWomenTemp = this.barFilterMoreWomen;
        this.barFilterMoreMenTemp = this.barFilterMoreMen;
        this.barFilterFriendsPresentTemp = this.barFilterFriendsPresent;
      }
    });
    alert.addButton({
      text: 'Okay',
      handler: data => {
        this.barFilterDontShowBars = this.barFilterDontShowBarsTemp;
        this.barFilterAttendance = this.barFilterAttendanceTemp;
        this.barFilterAvgRating = this.barFilterAvgRatingTemp;
        this.barFilterMoreWomen = this.barFilterMoreWomenTemp;
        this.barFilterMoreMen = this.barFilterMoreMenTemp;
        this.barFilterFriendsPresent = this.barFilterFriendsPresentTemp;
        this.updateMapMarkersVisibility();
      }
    });
    alert.present();
  }

  updateMapMarkersVisibility(){
    this.updateBarMarkersVisibility();
    this.updatePartyMarkersVisibility();
  }

  updateBarMarkersVisibility(){
    this.markerCluster.clearMarkers();

    let barMarkersToShow = new Array<any>();

    this.barMarkersOnMap.forEach((value: any, key: string) => {
      let barMarker = this.barMarkersOnMap.get(key);
      let bar : Bar = barMarker.bar;

      let barShouldBeShown = true;
      if(this.barFilterDontShowBars == true){
        barShouldBeShown = false;
      }
      if(this.barFilterAttendance == true){
        if(bar.numberOfPeopleAtBar < 1){
          barShouldBeShown = false;
        }
      }
      if(this.barFilterAvgRating == true){
        if(bar.averageRatingNumber < 2){
          barShouldBeShown = false;
        }
      }
      if(this.barFilterMoreWomen == true){
        if(bar.percentageOfWomen <= 50){
          barShouldBeShown = false;
        }
      }
      if(this.barFilterMoreMen == true){
        if(bar.percentageOfMen <= 50){
          barShouldBeShown = false;
        }
      }
      if(this.barFilterFriendsPresent == true){
        if(this.isAFriendPresentAtThisBar(bar) == false){
          barShouldBeShown = false
        }
      }

      if(barShouldBeShown == true){
        barMarkersToShow.push(barMarker);
      }
    });

    this.markerCluster.addMarkers(barMarkersToShow);
  }

  isAFriendPresentAtThisBar(bar : Bar) : boolean {
    for(let i = 0; i < this.allMyData.friends.length; i++){
      if(bar.attendees.has(this.allMyData.friends[i].facebookID) == true){
        let attendee = bar.attendees.get(this.allMyData.friends[i].facebookID);
        var attendanceIsExpired = Utility.isAttendanceExpired(attendee.timeOfLastKnownLocation);
        if(attendee.atBar && (attendanceIsExpired == false)){
          return true;
        }
      }
    }
    return false;
  }

  updatePartyMarkersVisibility(){
    if(this.partyFilterAnyToday == true){
      this.showPartyMarkersForTodayAndHideEverythingElse();
    }else if(this.partyFilterAnyThisWeek == true){
      this.showPartyMarkersForThisWeekAndHideEverythingElse();
    }else if(this.partyFilterDontShowParties == true){
      this.hideAllPartyMarkers();
    }else{
      this.showAllPartyMarkers();
    }
  }

  showPartyMarkersForTodayAndHideEverythingElse(){
    this.partyMarkersOnMap.forEach((value: any, key: string) => {
        let theMarker = this.partyMarkersOnMap.get(key);
        if(Utility.isPartyToday(theMarker.party) == true){
          theMarker.setMap(this.map);
        }else{
          theMarker.setMap(null);
        }
    });
  }

  showPartyMarkersForThisWeekAndHideEverythingElse(){
    this.partyMarkersOnMap.forEach((value: any, key: string) => {
        let theMarker = this.partyMarkersOnMap.get(key);
        if(Utility.isPartyThisWeek(theMarker.party) == true){
          theMarker.setMap(this.map);
        }else{
          theMarker.setMap(null);
        }
    });
  }

  hideAllPartyMarkers(){
    this.partyMarkersOnMap.forEach((value: any, key: string) => {
        let theMarkerToHide = this.partyMarkersOnMap.get(key);
        theMarkerToHide.setMap(null);
    });
  }

  showAllPartyMarkers(){
    this.partyMarkersOnMap.forEach((value: any, key: string) => {
        let theMarkerToShow = this.partyMarkersOnMap.get(key);
        theMarkerToShow.setMap(this.map);
    });
  }

  private updateMyGoingOutStatusIfNeeded(){
    let overallStatusNumber = 0;
    if(this.allMyData.me.status["manuallySet"] == "No"){
      for(let i = 0; i < this.allMyData.barsCloseToMe.length; i++){
        if(this.allMyData.barsCloseToMe[i].attendees.has(this.allMyData.me.facebookID)){
          let myAttendeeInfo = this.allMyData.barsCloseToMe[i].attendees.get(this.allMyData.me.facebookID);
          let statusNumber = this.getStatusNumber(myAttendeeInfo.status);
          if(statusNumber > overallStatusNumber){
            overallStatusNumber = statusNumber;
          }
        }
      }

      for(let i = 0; i < this.allMyData.barHostFor.length; i++){
        if(this.allMyData.barHostFor[i].attendees.has(this.allMyData.me.facebookID)){
          let myAttendeeInfo = this.allMyData.barHostFor[i].attendees.get(this.allMyData.me.facebookID);
          let statusNumber = this.getStatusNumber(myAttendeeInfo.status);
          if(statusNumber > overallStatusNumber){
            overallStatusNumber = statusNumber;
          }
        }
      }

      for(let i = 0; i < this.allMyData.invitedTo.length; i++){
        if(this.allMyData.invitedTo[i].invitees.has(this.allMyData.me.facebookID)){
          let myInviteeInfo = this.allMyData.invitedTo[i].invitees.get(this.allMyData.me.facebookID);
          let statusNumber = this.getStatusNumber(myInviteeInfo.status);
          if(statusNumber > overallStatusNumber){
            overallStatusNumber = statusNumber;
          }
        }
      }

      let oldStatusNumber = this.getStatusNumber(this.allMyData.me.status["goingOut"]);
      let newStatusNumber = overallStatusNumber;
      if(newStatusNumber > oldStatusNumber){
        let newStatus = this.getStatusFromStatusNumber(newStatusNumber);
        let manuallySet = "No";
        this.allMyData.changeMyGoingOutStatus(newStatus, manuallySet, this.http)
        .then((res) => {
          
        })
        .catch((err) => {
          this.allMyData.logError(this.tabName, "server", "changeMyGoingOutStatus query error : Err msg = " + err, this.http);
        });
      }

    }
  }

  // 0 = Unknown
  // 1 = No
  // 2 = Convince Me
  // 3 = Maybe
  // 4 = Yes
  private getStatusNumber(status : string) : number {
    let statusNumber = 0;
    switch(status){
      case "Unknown": {
        statusNumber = 0;
        break;
      }
      case "No": {
        statusNumber = 1;
        break;
      }
      case "Convince Me": {
        statusNumber = 2;
        break;
      }
      case "Maybe": {
        statusNumber = 3;
        break;
      }
      case "Yes": {
        statusNumber = 4;
        break;
      }
      case "Going": {
        statusNumber = 4;
        break;
      }
    }
    return statusNumber;
  }

  private getStatusFromStatusNumber(statusNumber : number) : string {
    let status = "Unknown";
    switch(statusNumber){
      case 0: {
        status = "Unknown";
        break;
      }
      case 1: {
        status = "No";
        break;
      }
      case 2: {
        status = "Convince Me";
        break;
      }
      case 3: {
        status = "Maybe";
        break;
      }
      case 4: {
        status = "Yes";
        break;
      }
    }
    return status;
  }

}
