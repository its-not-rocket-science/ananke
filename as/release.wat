(module
 (type $0 (func (param f64) (result i32)))
 (type $1 (func (param i32) (result f64)))
 (type $2 (func (param i32 i32 i32) (result i32)))
 (type $3 (func (param i32 i32) (result i32)))
 (type $4 (func (param i32) (result i32)))
 (type $5 (func (param i32)))
 (global $as/units/SCALE_Q i32 (i32.const 10000))
 (global $as/units/SCALE_m i32 (i32.const 10000))
 (global $as/units/SCALE_s i32 (i32.const 10000))
 (global $as/units/SCALE_kg i32 (i32.const 1000))
 (global $as/units/SCALE_N i32 (i32.const 100))
 (global $as/units/SCALE_W i32 (i32.const 1))
 (global $as/units/SCALE_J i32 (i32.const 1))
 (global $as/units/SCALE_mps i32 (i32.const 10000))
 (global $as/units/SCALE_mps2 i32 (i32.const 10000))
 (global $as/units/G_mps2 i32 (i32.const 98067))
 (global $~argumentsLength (mut i32) (i32.const 0))
 (memory $0 0)
 (export "SCALE_Q" (global $as/units/SCALE_Q))
 (export "SCALE_m" (global $as/units/SCALE_m))
 (export "SCALE_s" (global $as/units/SCALE_s))
 (export "SCALE_kg" (global $as/units/SCALE_kg))
 (export "SCALE_N" (global $as/units/SCALE_N))
 (export "SCALE_W" (global $as/units/SCALE_W))
 (export "SCALE_J" (global $as/units/SCALE_J))
 (export "SCALE_mps" (global $as/units/SCALE_mps))
 (export "SCALE_mps2" (global $as/units/SCALE_mps2))
 (export "G_mps2" (global $as/units/G_mps2))
 (export "q" (func $as/units/q))
 (export "clampQ" (func $as/units/clampQ@varargs))
 (export "qMul" (func $as/units/qMul))
 (export "qDiv" (func $as/units/qDiv))
 (export "mulDiv" (func $as/units/mulDiv))
 (export "to_m" (func $as/units/q))
 (export "to_s" (func $as/units/q))
 (export "to_kg" (func $as/units/to_kg))
 (export "to_N" (func $as/units/to_N))
 (export "to_W" (func $as/units/to_W))
 (export "to_J" (func $as/units/to_W))
 (export "to_mps" (func $as/units/q))
 (export "to_mps2" (func $as/units/q))
 (export "from_m" (func $as/units/from_m))
 (export "from_s" (func $as/units/from_m))
 (export "from_kg" (func $as/units/from_kg))
 (export "from_N" (func $as/units/from_N))
 (export "from_W" (func $as/units/from_W))
 (export "from_J" (func $as/units/from_W))
 (export "from_mps" (func $as/units/from_m))
 (export "from_mps2" (func $as/units/from_m))
 (export "sqrtQ" (func $as/units/sqrtQ))
 (export "cbrtQ" (func $as/units/cbrtQ))
 (export "memory" (memory $0))
 (export "__setArgumentsLength" (func $~setArgumentsLength))
 (func $as/units/q (param $0 f64) (result i32)
  (local $1 f64)
  local.get $0
  f64.const 1e4
  f64.mul
  local.tee $1
  f64.ceil
  local.tee $0
  local.get $0
  f64.const -1
  f64.add
  local.get $0
  f64.const -0.5
  f64.add
  local.get $1
  f64.le
  select
  i32.trunc_sat_f64_s
 )
 (func $as/units/clampQ@varargs (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  block $2of2
   block $1of2
    block $0of2
     block $outOfRange
      global.get $~argumentsLength
      i32.const 1
      i32.sub
      br_table $0of2 $1of2 $2of2 $outOfRange
     end
     unreachable
    end
    i32.const 0
    local.set $1
   end
   i32.const 10000
   local.set $2
  end
  local.get $1
  local.get $2
  local.get $0
  local.get $0
  local.get $2
  i32.gt_s
  select
  local.tee $0
  local.get $0
  local.get $1
  i32.lt_s
  select
 )
 (func $as/units/qMul (param $0 i32) (param $1 i32) (result i32)
  local.get $0
  i64.extend_i32_s
  local.get $1
  i64.extend_i32_s
  i64.mul
  i64.const 10000
  i64.div_s
  i32.wrap_i64
 )
 (func $as/units/qDiv (param $0 i32) (param $1 i32) (result i32)
  local.get $0
  i64.extend_i32_s
  i64.const 10000
  i64.mul
  local.get $1
  i64.extend_i32_s
  i64.div_s
  i32.wrap_i64
 )
 (func $as/units/mulDiv (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  local.get $0
  i64.extend_i32_s
  local.get $1
  i64.extend_i32_s
  i64.mul
  local.get $2
  i64.extend_i32_s
  i64.div_s
  i32.wrap_i64
 )
 (func $as/units/to_kg (param $0 f64) (result i32)
  (local $1 f64)
  local.get $0
  f64.const 1e3
  f64.mul
  local.tee $1
  f64.ceil
  local.tee $0
  local.get $0
  f64.const -1
  f64.add
  local.get $0
  f64.const -0.5
  f64.add
  local.get $1
  f64.le
  select
  i32.trunc_sat_f64_s
 )
 (func $as/units/to_N (param $0 f64) (result i32)
  (local $1 f64)
  local.get $0
  f64.const 100
  f64.mul
  local.tee $1
  f64.ceil
  local.tee $0
  local.get $0
  f64.const -1
  f64.add
  local.get $0
  f64.const -0.5
  f64.add
  local.get $1
  f64.le
  select
  i32.trunc_sat_f64_s
 )
 (func $as/units/to_W (param $0 f64) (result i32)
  (local $1 f64)
  local.get $0
  f64.ceil
  local.tee $1
  local.get $1
  f64.const -1
  f64.add
  local.get $1
  f64.const -0.5
  f64.add
  local.get $0
  f64.le
  select
  i32.trunc_sat_f64_s
 )
 (func $as/units/from_m (param $0 i32) (result f64)
  local.get $0
  f64.convert_i32_s
  f64.const 1e4
  f64.div
 )
 (func $as/units/from_kg (param $0 i32) (result f64)
  local.get $0
  f64.convert_i32_s
  f64.const 1e3
  f64.div
 )
 (func $as/units/from_N (param $0 i32) (result f64)
  local.get $0
  f64.convert_i32_s
  f64.const 100
  f64.div
 )
 (func $as/units/from_W (param $0 i32) (result f64)
  local.get $0
  f64.convert_i32_s
 )
 (func $as/units/sqrtQ (param $0 i32) (result i32)
  (local $1 i64)
  (local $2 i64)
  (local $3 i32)
  (local $4 i64)
  i32.const 1
  local.get $0
  local.get $0
  i32.const 0
  i32.le_s
  select
  i64.extend_i32_s
  i64.const 10000
  i64.mul
  local.set $4
  i64.const 10000
  local.set $1
  loop $for-loop|0
   local.get $3
   i32.const 10
   i32.lt_s
   if
    local.get $1
    local.get $1
    local.get $4
    local.get $1
    i64.div_s
    i64.add
    i64.const 2
    i64.div_s
    local.tee $2
    i64.ne
    if
     local.get $2
     local.set $1
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|0
    end
   end
  end
  local.get $1
  i32.wrap_i64
 )
 (func $as/units/cbrtQ (param $0 i32) (result i32)
  (local $1 i64)
  (local $2 i32)
  (local $3 i64)
  i32.const 1
  local.get $0
  local.get $0
  i32.const 0
  i32.le_s
  select
  i64.extend_i32_s
  i64.const 100000000
  i64.mul
  local.set $3
  i64.const 10000
  local.set $1
  loop $for-loop|0
   local.get $2
   i32.const 12
   i32.lt_s
   if
    block $for-break0
     local.get $3
     local.get $1
     local.get $1
     i64.mul
     i64.div_s
     local.get $1
     i64.const 1
     i64.shl
     i64.add
     i64.const 3
     i64.div_s
     local.tee $1
     i64.const 0
     i64.le_s
     if
      i64.const 1
      local.set $1
      br $for-break0
     end
     local.get $2
     i32.const 1
     i32.add
     local.set $2
     br $for-loop|0
    end
   end
  end
  local.get $1
  i32.wrap_i64
 )
 (func $~setArgumentsLength (param $0 i32)
  local.get $0
  global.set $~argumentsLength
 )
)
