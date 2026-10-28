plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.purestream.ytpremium"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.purestream.ytpremium"
        minSdk = 21
        targetSdk = 35
        versionCode = 5
        versionName = "5.0.0"
    }

    signingConfigs {
        getByName("debug") {
            val keystoreFile = rootProject.file("debug.keystore")
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
