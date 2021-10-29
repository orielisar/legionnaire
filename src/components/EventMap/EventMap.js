import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMapboxGl, {
  Marker,
  Cluster,
  Popup,
  ZoomControl,
  MapContext
} from 'react-mapbox-gl';
import mapboxgl from 'mapbox-gl';
//import mapboxgl from 'mapbox-gl/dist/mapbox-gl-csp';
import MapboxWorker from 'worker-loader!mapbox-gl/dist/mapbox-gl-csp-worker'; // eslint-disable-line import/no-webpack-loader-syntax
import { Link } from 'react-router-dom';
import { find, findIndex, last, sortBy } from 'lodash';
import { getLabel as l, parseDate } from '../../utils';
import { PlaceRoute, PersonRoute } from '../../constants.js';

import 'mapbox-gl/dist/mapbox-gl.css';
import AnimatedLineLayer from './AnimatedLineLayer';
import EventTimeline from './EventTimeline';
import PinPoint from './icons/PinPoint';
import '../../styles/components/EventMap/EventMap.scss';

// Load worker code separately with worker-loader
mapboxgl.workerClass = MapboxWorker; // Wire up loaded worker to be used instead of the default

const Map = ReactMapboxGl({
  accessToken: "pk.eyJ1IjoibGVnaW9ubmFpcmVzIiwiYSI6ImNrcm02cGxvYTAwa2IzMm85MG02b2VqMjYifQ.OuFSbi7i0SVS8O8QnOjpKA"
});

const FITBOUNDS_OPTIONS = {
  padding: {
    top:    50,
    bottom: 50,
    left:   150,
    right:  350
  }
};

const FITBOUNDS_OPTIONS_SMALL = {
  padding: {
    top:    50,
    bottom: 50,
    left:   100,
    right:  100
  }
}

const EventMap = ({ events = [], className, showLines = false, fitBoundsOnLoad = false }) => {

  const mapRef                                = useRef();
  const [zoom, setZoom]                       = useState(7);
  const [center, setCenter]                   = useState([2.1008033, 47.6148384]);
  const [fitBounds, setFitBounds]             = useState(null);
  const [selectedEvents, setSelectedEvents]   = useState(null);
  const [lineCoordinates, setLineCoordinates] = useState([]);
  const [isPlaying, setPlaying]               = useState(false);


  useEffect(_ => {
    if(events.length === 0) return;

    if(fitBoundsOnLoad) {
      let bounds = new mapboxgl.LngLatBounds();
      events.forEach(event => bounds.extend(event.coordinates));
      setFitBounds(bounds.toArray());
    } else
      setCenter(events[0].coordinates);

    // To fix the issue when the map is resized in the search page
    mapRef.current?.resize();

    if(showLines) {
      const coordinates = events.slice(0, -1).map((event, i) => [
          event.id,
          parseFloat(event.coordinates[0]),
          parseFloat(event.coordinates[1]),
          parseFloat(events[i+1].coordinates[0]),
          parseFloat(events[i+1].coordinates[1]),
          50
      ]);

      setLineCoordinates(coordinates);
    }
  }, [events, showLines, fitBoundsOnLoad]);


  const nextEvent = useCallback(eventId => {

    if(!isPlaying) return;

    let i           = findIndex(events, {id: eventId});

    if(i === events.length - 1) {
      setPlaying(false);
      setCenter(events[i].coordinates);
      return;
    }

    const selEvents = [events[++i]];
    const placeId   = selEvents[0].place.id;

    //  Check if next events have the same place
    events.slice(i+1).reduce((isNext, event) => isNext && event.place.id === placeId && selEvents.push(event), true);

    setSelectedEvents(selEvents);

  }, [events, isPlaying]);


  useEffect(_ => {
    if(isPlaying && selectedEvents) {

      const i = findIndex(events, selectedEvents[0]);

      if(i > 0) {
        setFitBounds([events[i-1].coordinates, events[i].coordinates]);
        setLineCoordinates(lineCoordinates =>
          [...lineCoordinates, [
            last(selectedEvents).id,
            parseFloat(events[i-1].coordinates[0]),
            parseFloat(events[i-1].coordinates[1]),
            parseFloat(events[i].coordinates[0]),
            parseFloat(events[i].coordinates[1])
          ]]
        );
      } else {
        setTimeout(_ => nextEvent(last(selectedEvents).id), 2000);
      }
    }
  }, [selectedEvents, isPlaying, events, nextEvent]);


  const clusterMarker = (coordinates, pointCount, getLeaves) => {

    const clickHandler  = (e, f) => {

      let clusterEvents = getLeaves()
        .map(marker => find(events, {id: parseInt(marker.key)}))

      // Check if all events are at the same place
      if(zoom > 12 || clusterEvents.filter(event => event.place.id !== clusterEvents[0].place.id).length === 0) {
        clusterEvents = sortBy(clusterEvents, ['data.date']);
        marker_clickHandler(clusterEvents);
      } else {
        let bounds = new mapboxgl.LngLatBounds();
        clusterEvents.forEach(event => bounds.extend(event.coordinates));
        setFitBounds(bounds.toArray());
      }
    }

    return (
      <Marker
        coordinates = {coordinates}
        key         = {coordinates.toString()}
        className   = "cluster"
        onClick     = {clickHandler}
      >
        { pointCount < 10 ? pointCount : '9+' }
      </Marker>
    );
  }

  const marker_clickHandler = event => {
    setSelectedEvents(event);
    setCenter(event[0].coordinates);
    if(isPlaying)
      setLineCoordinates([]);
  }

  const playButton_clickHandler = () => {
    if(!isPlaying) {
      let i = selectedEvents ? findIndex(events, last(selectedEvents)) + 1 : 0;
      if(i === events.length) i = 0;
      marker_clickHandler([events[i]]);
      setLineCoordinates([]);
    }

    setPlaying(!isPlaying);
  }


  return (
    <div className={`EventMap ${className}`}>

      {showLines &&
        <EventTimeline
          events          = {events}
          selectedEvents  = {selectedEvents}
          isPlaying       = {isPlaying}
          onEventClick    = {marker_clickHandler}
          onPlayClick     = {playButton_clickHandler}
        />
      }

      <Map
        style                   = {`mapbox://styles/legionnaires/ckto0cfh40okl17pmek6tmiuz`}
        className               = "map"
        center                  = {center}
        zoom                    = {[zoom]}
        fitBounds               = {fitBounds}
        fitBoundsOptions        = {showLines ? FITBOUNDS_OPTIONS : FITBOUNDS_OPTIONS_SMALL}
        renderChildrenInPortal  = {true}
        onClick                 = {() => setSelectedEvents(null)}
        onZoomEnd               = {map => setZoom(map.transform._zoom)}
      >
        <ZoomControl position="topLeft" className="zoomControl"/>
        <Cluster
          ClusterMarkerFactory  = {clusterMarker}
          maxZoom               = {20}
        >
          {events.map((event, i) => (
            <Marker
              key         = {event.id}
              coordinates = {event.coordinates}
              className   = "marker"
              onClick     = {_ => marker_clickHandler([event])}
            >
              <PinPoint label={showLines ? String.fromCharCode(65 + i) : null} />
            </Marker>
          ))}
        </Cluster>

        {lineCoordinates.map((coordinates, i) => (
          <AnimatedLineLayer
            key             = {coordinates[0]}
            eventId         = {coordinates[0]}
            startX          = {coordinates[1]}
            startY          = {coordinates[2]}
            endX            = {coordinates[3]}
            endY            = {coordinates[4]}
            speed           = {coordinates[5]}
            onAnimationEnd  = {nextEvent}
          />
        ))}

        {selectedEvents && !isPlaying && (
          <Popup
            coordinates = {selectedEvents[0].coordinates}
            anchor      = "top"
            offset      = {[0, 5]}
            key         = {selectedEvents[0].id}
            className   = "popup"
          >
            <div className="title">
              <Link to={`${PlaceRoute.to}${selectedEvents[0].place.slug}`}>
                {selectedEvents[0].place.title}
              </Link>
            </div>
            {selectedEvents.map(event => (
              <div key={event.id}>
                {parseDate(event.data.date)} - {l(`event.${event.data.event_type}`)}
                <Link to={`${PersonRoute.to}${event.person.slug}`}> {event.person.title}</Link>
              </div>
            ))}
          </Popup>
        )}

        <MapContext.Consumer>
          {(map) => {
            mapRef.current = map;
            map.on("wheel", e => !e.originalEvent.ctrlKey && !e.originalEvent.metaKey && e.preventDefault());
          }}
        </MapContext.Consumer>

      </Map>
    </div>
  )
}

export default EventMap;
