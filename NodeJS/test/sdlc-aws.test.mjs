import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const stack=JSON.parse(fs.readFileSync(new URL('../../aws/cli/sdlc-service.json',import.meta.url),'utf8'));
const resources=stack.Resources;
test('hosted SDLC has separate JWT API with no public catch-all',()=>{
  assert.equal(resources.ProtectedRoutes.Properties.RouteKey,'ANY /sdlc/{proxy+}');
  assert.equal(resources.ProtectedRoutes.Properties.AuthorizationType,'JWT');
  assert.equal(resources.HealthRoute.Properties.RouteKey,'GET /sdlc/health');
  assert.equal(resources.HealthRoute.Properties.AuthorizationType,'NONE');
  assert.equal(resources.JwtAuthorizer.Properties.AuthorizerType,'JWT');
  assert.ok(!Object.values(resources).some(v=>v.Type==='AWS::ApiGatewayV2::Route'&&v.Properties.RouteKey==='$default'));
});
test('runs persist in encrypted EFS and no RDS attached to control plane',()=>{
  assert.equal(resources.Fs.Properties.Encrypted,true);
  assert.equal(resources.TaskDef.Properties.Volumes[0].EFSVolumeConfiguration.TransitEncryption,'ENABLED');
  assert.equal(resources.Service.Properties.DesiredCount,1);
  assert.ok(resources.Service.DependsOn.includes('MountA'));
  assert.ok(!Object.values(resources).some(v=>v.Type==='AWS::RDS::DBInstance'));
});
test('executor role cannot deploy AWS resources and browser cannot override allowlist',()=>{
  assert.equal(resources.TaskRole.Properties.Policies,undefined);
  assert.equal(resources.TaskSg.Properties.SecurityGroupIngress,undefined);
  const env=resources.TaskDef.Properties.ContainerDefinitions[0].Environment;
  assert.ok(env.some(v=>v.Name==='SDLC_ADMIN_SUBS'&&v.Value.Ref==='AdminSubs'));
  assert.ok(env.some(v=>v.Name==='SDLC_PRIVATE_VPC'&&v.Value==='true'));
});
