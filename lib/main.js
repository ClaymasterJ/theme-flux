'use babel';

import { CompositeDisposable } from 'atom';
import SolarCalc from 'solar-calc';

var http = require('http');
var https = require('https');
// const rp = require('request-promise');

function themeToConfigStringEnum({ metadata: { name } }) {
  return name;
  // return {
  //   value: name,
  //   description: getThemeTitle(name),
  // };
}

// Get list of themes
const loadedThemes = atom.themes.getLoadedThemes();
const enumThemeUI = loadedThemes
  .filter(theme => theme.metadata.theme === 'ui')
  .map(themeToConfigStringEnum);

const enumThemeSyntax = loadedThemes
  .filter(theme => theme.metadata.theme === 'syntax')
  .map(themeToConfigStringEnum);



export default {
  intervalId: null,

  wasDay: null,

  dateLastSync: null,

  lockSync: false,

  config: {
    themes: {
      type: "object",
      order: 1,
      properties: {
        day: {
          order: 1,
          type: 'object',
          properties: {
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-light-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-light-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        night: {
          order: 2,
          type: 'object',
          properties: {
            ui: {
              order: 1,
              title: 'UI Theme',
              type: 'string',
              default: 'one-dark-ui',
              enum: enumThemeUI,
            },
            syntax: {
              order: 2,
              title: 'Syntax Theme',
              type: 'string',
              default: 'one-dark-syntax',
              enum: enumThemeSyntax,
            },
          },
        },
        autoUpdateConfig: {
          title: "Update Config on Theme Change",
          description: "Update this package's day or night theme configuration when you change it in Atom theme settings",
          type: "boolean",
          default: true
        }
      }
    },
    coordinates: {
      description: "Coordinates are used to deterimine the location of the sun",
      order: 2,
      type: 'object',
      properties: {
        useIP: {
          order: 1,
          title: 'Use IP',
          type: 'boolean',
          description: 'Use IP4 address for approximate location (may not work correctly when using a VPN)',
          default: false
        },
        override: {
          order: 2,
          type: 'object',
          description: "Manually override coordinates",
          properties: {
            latitude: {
              order: 1,
              title: 'Latitude Override',
              type: 'number',
              default: 33.0
            },
            longitude: {
              order: 2,
              title: 'Longitude Override',
              type: 'number',
              default: -84.0
            }
          }
        }
      }
    }
  },

  async activate() {
    console.log("Start")

    this.checkUpdateTheme();


    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.config.observe('core.themes', {}, async () => {
      if (atom.config.get('theme-flux.themes.autoUpdateConfig')) {
        let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates();
        let is_day = this.getIsDay(latitude = coordinates_latitude, longitude = coordinates_longitude);
        let [theme_ui, theme_syntax] = atom.config.get('core.themes');

        this.updateConfig(
          theme_ui,
          theme_syntax,
          is_day
        );
        // this.updateTheme(is_day);
      }
    }));

    // Regardless of autoUpdateConfig setting, when the user changes package
    //     config, update Atom theme
    if (true) {
      this.subscriptions.add(atom.config.observe('theme-flux', {}, async () => {
        setTimeout(async () => {
          let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates();
          let is_day = this.getIsDay(latitude = coordinates_latitude, longitude = coordinates_longitude);
          let [theme_ui, theme_syntax] = atom.config.get('core.themes');

          this.updateTheme(is_day);
          // this.updateConfig(
          //   theme_ui,
          //   theme_syntax,
          //   is_day
          // );

        }, 0);


      }));
    }


    this.intervalId = setInterval(this.checkUpdateTheme.bind(this), this.getMillisecondsFromMinutes(15));
  },

  async checkUpdateTheme() {
    console.log("checkUpdateTheme");
    let [coordinates_latitude, coordinates_longitude] = await this.getCoordinates()

    this.updateTheme(this.getIsDay(latitude = coordinates_latitude, longitude = coordinates_longitude));
  },

  deactivate() {
    this.subscriptions.dispose();

    clearInterval(this.intervalId);
    this.intervalId = null;
  },

  getHTTPPromise(options, option_json = false, option_https = false) {
    var get_module = option_https ? https : http

    return new Promise((resolve, reject) => {
      get_module.get(options, (resp) => {
        var body = ''
        resp.on('data', function(data) {
          body += data;
        });

        resp.on('end', function() {
          if (option_json) {
            body = JSON.parse(body);
          }
          resolve(body);
        });

        resp.on("error", err => {
          reject(err);
        });
      });
    });
  },

  async getCoordinates() {
    var coordinates_latitude = atom.config.get('theme-flux.coordinates.override.latitude');
    var coordinates_longitude = atom.config.get('theme-flux.coordinates.override.longitude');

    if (atom.config.get('theme-flux.coordinates.useIP')) {
      var promise_ip = this.getIPAddress();
      promise_ip.then(resp_ip => {
        var promise_location = this.getHTTPPromise({
          path: `/${resp_ip}/json/`,
          host: 'ipapi.co',
          port: 443,
          headers: { 'User-Agent': 'nodejs-ipapi-v1.02' }
        }, option_json = true, option_https = true);

        promise_location.then((resp) => {
          coordinates_latitude = resp["latitude"]
          coordinates_longitude = resp["longitude"]
        })
      })
      await promise_ip
    }

    return [coordinates_latitude, coordinates_longitude]
  },

  getIPAddress() {
    return this.getHTTPPromise({ 'host': 'api.ipify.org', 'port': 80, 'path': '/' });
  },

  updateConfig(theme_ui, theme_syntax, is_day) {
    console.log("UPDATE CONFIG");
    // Update this package's configuration based on what is set in Atom theme
    if (is_day) {
      atom.config.set('theme-flux.themes.day.ui', theme_ui);
      atom.config.set('theme-flux.themes.day.syntax', theme_syntax);
    } else {
      atom.config.set('theme-flux.themes.night.ui', theme_ui);
      atom.config.set('theme-flux.themes.night.syntax', theme_syntax);
    }
  },

  updateTheme(is_day) {
    console.log("UPDATE THEME CALL");
    //
    // if ((new Date() - this.dateLastSync) < (10 * 1000)) {
    //   console.log("WAITING TO UPDATE THEME")
    //   return;
    // }
    // console.log("UPDATE THEME");
    // this.dateLastSync = new Date();

    if (is_day) {
      this.scheduleThemeUpdate([
        atom.config.get('theme-flux.themes.day.ui'),
        atom.config.get('theme-flux.themes.day.syntax'),
      ]);
    } else {
      this.scheduleThemeUpdate([
        atom.config.get('theme-flux.themes.night.ui'),
        atom.config.get('theme-flux.themes.night.syntax'),
      ]);
    }
  },

  scheduleThemeUpdate(themes) {
    atom.config.set('core.themes', themes);
  },

  getIsDay(latitude = null, longitude = null) {
    var date_now = new Date();

    var solar = new SolarCalc(
      date_now, latitude, longitude
    )

    return date_now >= solar.sunrise && date_now <= solar.sunset;
  },

  getCheckIntervalInMinutes() {
    return 15;
  },

  getMillisecondsFromMinutes(minutes) {
    return minutes * 60 * 1000;
  }
};
