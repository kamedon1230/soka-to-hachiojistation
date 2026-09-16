mod utils;

use wasm_bindgen::prelude::*;
use gtfs_realtime::FeedMessage;
use prost::Message;
use serde::Serialize;
use std::collections::HashMap;

/// TypeScript側に返却するデータ構造
#[derive(Serialize)]
pub struct TripDelayInfo {
    pub delay_seconds: i32,
    pub is_added_trip: bool,
}

/// JS/TSから呼び出却するメイン関数
#[wasm_bindgen]
pub fn parse_gtfs_rt(bytes: &[u8]) -> Result<JsValue, JsValue> {
    // 1. バイト配列をProtobufとしてデコード
    let feed = FeedMessage::decode(bytes)
        .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;

    let mut result_map: HashMap<String, TripDelayInfo> = HashMap::new();

    // 2. データ内をイテレートして必要な情報だけ抽出
    for entity in feed.entity {
        if let Some(trip_update) = entity.trip_update {
            let rel = trip_update.trip.schedule_relationship();
            let trip_id = trip_update.trip.trip_id.unwrap_or_default();
            
            // 最新の停留所遅延(delay)を取得
            let mut delay_seconds = 0;
            if let Some(latest_stu) = trip_update.stop_time_update.last() {
                if let Some(ref departure) = latest_stu.departure {
                    delay_seconds = departure.delay.unwrap_or(0);
                } else if let Some(ref arrival) = latest_stu.arrival {
                    delay_seconds = arrival.delay.unwrap_or(0);
                }
            }

            // 増発・臨時便フラグの判定
            use gtfs_realtime::trip_descriptor::ScheduleRelationship;
            let is_added_trip = matches!(
                rel,
                ScheduleRelationship::Unscheduled | ScheduleRelationship::Duplicated
            );

            result_map.insert(
                trip_id,
                TripDelayInfo {
                    delay_seconds,
                    is_added_trip,
                },
            );
        }
    }

    // 3. RustのHashMapをJavaScriptのObject/Mapへ変換
    serde_wasm_bindgen::to_value(&result_map)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}